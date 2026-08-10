const yauzl = require("yauzl");
const { SaxesParser } = require("saxes");
const { farmMapBounds } = require("./farm-area-map");

const KMZ_LIMITS = Object.freeze({
  compressedBytes: 3 * 1024 * 1024,
  totalUncompressedBytes: 12 * 1024 * 1024,
  entryUncompressedBytes: 8 * 1024 * 1024,
  entryCount: 128,
  kmlCount: 8,
  compressionRatio: 100,
});

class FarmAreaKmzError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "FarmAreaKmzError";
    this.code = code;
    this.details = details;
  }
}

function kmzError(code, message, details) {
  return new FarmAreaKmzError(code, message, details);
}

function safeZipEntryName(entry) {
  const fileName = String(entry?.fileName || "");
  const invalid = yauzl.validateFileName(fileName);
  if (invalid || !fileName || fileName.includes("\0")) {
    throw kmzError("KMZ_UNSAFE_PATH", "KMZ contains an unsafe file path", { fileName });
  }
  const unixMode = Number(entry?.externalFileAttributes || 0) >>> 16;
  if ((unixMode & 0xf000) === 0xa000) {
    throw kmzError("KMZ_SYMLINK_REJECTED", "KMZ symbolic links are not allowed", { fileName });
  }
  return fileName;
}

function readZipEntry(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      let size = 0;
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > KMZ_LIMITS.entryUncompressedBytes) {
          stream.destroy(kmzError("KMZ_ENTRY_TOO_LARGE", "KMZ entry exceeds the uncompressed size limit"));
          return;
        }
        chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks, size)));
    });
  });
}

function extractKmlEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return Promise.reject(kmzError("KMZ_EMPTY", "KMZ file is empty"));
  }
  if (buffer.length > KMZ_LIMITS.compressedBytes) {
    return Promise.reject(kmzError("KMZ_TOO_LARGE", "KMZ exceeds the 3 MB compressed size limit"));
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return Promise.reject(kmzError("KMZ_INVALID_SIGNATURE", "File is not a valid ZIP/KMZ archive"));
  }

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      autoClose: true,
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    }, (openError, zipfile) => {
      if (openError) return reject(kmzError("KMZ_MALFORMED", "KMZ archive is malformed"));
      let settled = false;
      let seenEntries = 0;
      let totalUncompressed = 0;
      const kmlEntries = [];
      const fail = (error) => {
        if (settled) return;
        settled = true;
        try { zipfile.close(); } catch { /* already closed */ }
        reject(error instanceof FarmAreaKmzError ? error : kmzError("KMZ_MALFORMED", "KMZ archive could not be read"));
      };
      if (zipfile.entryCount > KMZ_LIMITS.entryCount) {
        return fail(kmzError("KMZ_TOO_MANY_FILES", "KMZ contains too many files"));
      }
      zipfile.once("error", fail);
      zipfile.on("entry", async (entry) => {
        try {
          seenEntries += 1;
          if (seenEntries > KMZ_LIMITS.entryCount) throw kmzError("KMZ_TOO_MANY_FILES", "KMZ contains too many files");
          const fileName = safeZipEntryName(entry);
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw kmzError("KMZ_ENCRYPTED", "Encrypted KMZ entries are not supported");
          totalUncompressed += Number(entry.uncompressedSize || 0);
          if (Number(entry.uncompressedSize || 0) > KMZ_LIMITS.entryUncompressedBytes
              || totalUncompressed > KMZ_LIMITS.totalUncompressedBytes) {
            throw kmzError("KMZ_UNCOMPRESSED_TOO_LARGE", "KMZ exceeds the uncompressed size limit");
          }
          if (Number(entry.uncompressedSize || 0) > 0) {
            const compressedSize = Number(entry.compressedSize || 0);
            if (compressedSize <= 0 || Number(entry.uncompressedSize) / compressedSize > KMZ_LIMITS.compressionRatio) {
              throw kmzError("KMZ_COMPRESSION_RATIO", "KMZ entry has an unsafe compression ratio", { fileName });
            }
          }
          if (fileName.endsWith("/")) {
            zipfile.readEntry();
            return;
          }
          const lowerName = fileName.toLowerCase();
          const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
          const allowedAsset = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ds_store"].includes(extension)
            || lowerName.startsWith("__macosx/");
          if (extension !== ".kml" && !allowedAsset) {
            throw kmzError("KMZ_UNEXPECTED_CONTENT", "KMZ contains an unsupported file type", { fileName });
          }
          if (extension !== ".kml") {
            zipfile.readEntry();
            return;
          }
          if (kmlEntries.length >= KMZ_LIMITS.kmlCount) throw kmzError("KMZ_TOO_MANY_KML", "KMZ contains too many KML files");
          const content = await readZipEntry(zipfile, entry);
          kmlEntries.push({ fileName, content: content.toString("utf8") });
          zipfile.readEntry();
        } catch (error) {
          fail(error);
        }
      });
      zipfile.once("end", () => {
        if (settled) return;
        settled = true;
        if (!kmlEntries.length) return reject(kmzError("KMZ_KML_MISSING", "KMZ does not contain a KML file"));
        resolve({ entries: kmlEntries, entryCount: seenEntries, totalUncompressedBytes: totalUncompressed });
      });
      zipfile.readEntry();
    });
  });
}

function localTagName(tag) {
  if (typeof tag === "string") return tag.split(":").pop();
  return String(tag?.local || tag?.name || "").split(":").pop();
}

function parseCoordinateRing(value, sourceFile, placemarkName) {
  const points = String(value || "").trim().split(/\s+/).filter(Boolean).map((tuple) => {
    const parts = tuple.split(",");
    const longitude = Number(parts[0]);
    const latitude = Number(parts[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
        || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw kmzError("KML_INVALID_COORDINATE", "KML contains an invalid longitude or latitude", { sourceFile, placemarkName });
    }
    return [longitude, latitude];
  });
  if (points.length < 3) throw kmzError("KML_INVALID_POLYGON", "KML polygon has fewer than three coordinate points", { sourceFile, placemarkName });
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  const distinct = new Set(points.slice(0, -1).map((point) => `${point[0]},${point[1]}`));
  if (distinct.size < 3) throw kmzError("KML_DEGENERATE_POLYGON", "KML polygon does not contain three distinct coordinate points", { sourceFile, placemarkName });
  const twiceArea = points.slice(0, -1).reduce((sum, point, index) => {
    const next = points[index + 1];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(twiceArea) < 1e-14) throw kmzError("KML_DEGENERATE_POLYGON", "KML polygon has zero area", { sourceFile, placemarkName });
  return points;
}

function parseKmlDocument(kml, sourceFile = "doc.kml") {
  const xml = String(kml || "");
  if (!xml.trim()) throw kmzError("KML_EMPTY", "KML file is empty", { sourceFile });
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) throw kmzError("KML_DTD_REJECTED", "KML DTD and entity declarations are not allowed", { sourceFile });
  if (/<(?:\w+:)?NetworkLink\b|<(?:\w+:)?Model\b/i.test(xml)) {
    throw kmzError("KML_REMOTE_LINK_REJECTED", "KML remote links and external models are not allowed", { sourceFile });
  }

  const features = [];
  const stats = { placemarkCount: 0, polygonPlacemarkCount: 0, pointPlacemarkCount: 0, otherPlacemarkCount: 0 };
  const stack = [];
  let placemark = null;
  let polygon = null;
  let capture = null;
  let capturedText = "";
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => { throw kmzError("KML_DTD_REJECTED", "KML DTD declarations are not allowed", { sourceFile }); });
  parser.on("opentag", (tag) => {
    const local = localTagName(tag);
    const parent = stack[stack.length - 1] || "";
    stack.push(local);
    if (["NetworkLink", "Model"].includes(local)) throw kmzError("KML_REMOTE_LINK_REJECTED", "KML remote links and external models are not allowed", { sourceFile });
    if (local === "Placemark") placemark = { name: "", polygons: [], hasPoint: false };
    else if (placemark && local === "Polygon") polygon = { outer: null };
    else if (placemark && local === "Point") placemark.hasPoint = true;
    else if (placemark && local === "name" && parent === "Placemark") {
      capture = "name";
      capturedText = "";
    } else if (polygon && local === "coordinates" && stack.includes("outerBoundaryIs")) {
      capture = "coordinates";
      capturedText = "";
    }
  });
  const appendText = (text) => { if (capture) capturedText += text; };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", (tag) => {
    const local = localTagName(tag);
    if (capture === "name" && local === "name") {
      placemark.name = capturedText.trim();
      capture = null;
    } else if (capture === "coordinates" && local === "coordinates") {
      polygon.outer = parseCoordinateRing(capturedText, sourceFile, placemark?.name || "");
      capture = null;
    }
    if (local === "Polygon" && polygon) {
      if (!polygon.outer) throw kmzError("KML_EMPTY_GEOMETRY", "KML polygon has no outer boundary coordinates", { sourceFile, placemarkName: placemark?.name || "" });
      placemark.polygons.push(polygon.outer);
      polygon = null;
    } else if (local === "Placemark" && placemark) {
      stats.placemarkCount += 1;
      if (placemark.polygons.length) {
        stats.polygonPlacemarkCount += 1;
        if (!placemark.name) throw kmzError("KML_PLACEMARK_NAME_REQUIRED", "Every polygon Placemark must have a name", { sourceFile });
        features.push({
          type: "Feature",
          properties: { name: placemark.name, source_file: sourceFile },
          geometry: placemark.polygons.length === 1
            ? { type: "Polygon", coordinates: [placemark.polygons[0]] }
            : { type: "MultiPolygon", coordinates: placemark.polygons.map((ring) => [ring]) },
        });
      } else if (placemark.hasPoint) stats.pointPlacemarkCount += 1;
      else stats.otherPlacemarkCount += 1;
      placemark = null;
    }
    stack.pop();
  });
  parser.on("error", (error) => { throw kmzError("KML_MALFORMED_XML", "KML XML is malformed", { sourceFile, message: error.message }); });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof FarmAreaKmzError) throw error;
    throw kmzError("KML_MALFORMED_XML", "KML XML is malformed", { sourceFile });
  }
  return { features, stats };
}

function parseKml(kml, sourceFile = "doc.kml") {
  return parseKmlDocument(kml, sourceFile).features;
}

async function parseFarmAreaKmz(buffer) {
  const extracted = await extractKmlEntries(buffer);
  const documents = extracted.entries.map((entry) => parseKmlDocument(entry.content, entry.fileName));
  const features = documents.flatMap((document) => document.features);
  const sourceStats = documents.reduce((total, document) => ({
    placemarkCount: total.placemarkCount + document.stats.placemarkCount,
    polygonPlacemarkCount: total.polygonPlacemarkCount + document.stats.polygonPlacemarkCount,
    pointPlacemarkCount: total.pointPlacemarkCount + document.stats.pointPlacemarkCount,
    otherPlacemarkCount: total.otherPlacemarkCount + document.stats.otherPlacemarkCount,
  }), { placemarkCount: 0, polygonPlacemarkCount: 0, pointPlacemarkCount: 0, otherPlacemarkCount: 0 });
  if (!features.length) throw kmzError("KML_POLYGONS_MISSING", "KMZ does not contain any polygon Placemarks");
  const bounds = farmMapBounds(features);
  if (bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))) {
    throw kmzError("KML_INVALID_BOUNDS", "KMZ polygon bounds are invalid");
  }
  return {
    type: "FeatureCollection",
    source: {
      format: "KMZ",
      kmlFiles: extracted.entries.map((entry) => entry.fileName),
      archiveEntryCount: extracted.entryCount,
      totalUncompressedBytes: extracted.totalUncompressedBytes,
      featureCount: features.length,
      ...sourceStats,
    },
    bounds,
    features,
  };
}

module.exports = {
  FarmAreaKmzError,
  KMZ_LIMITS,
  extractKmlEntries,
  parseCoordinateRing,
  parseFarmAreaKmz,
  parseKml,
  parseKmlDocument,
};
