const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("webapp/app.js", "utf8");
const actions = require("../api/farm-actions.js")._test;
const actionSource = fs.readFileSync("api/farm-actions.js", "utf8");

test("survey resolution uses assignment precedence rather than an activity name", () => {
  assert.match(app, /function farmSurveyAssignmentRank/);
  assert.match(app, /condition\.activity_group_id/);
  assert.match(app, /condition\.work_type/);
  assert.match(app, /assignment\.block_id/);
  assert.match(app, /assignment\.team_id/);
  assert.match(app, /selection_source: "general"/);
});

test("server conditional visibility applies required validation only to visible questions", () => {
  const controlling = { answer_text: "yes" };
  const answers = new Map([["READY", controlling]]);
  assert.equal(actions.surveyQuestionVisible({ conditional_json: { question_code: "READY", equals: "yes" } }, answers), true);
  assert.equal(actions.surveyQuestionVisible({ conditional_json: { question_code: "READY", equals: "no" } }, answers), false);
  assert.equal(actions.surveyAnswerComplete({ answer_boolean: false, answer_json: {} }), true);
});

test("survey response snapshots, private evidence and idempotent findings remain server-owned", () => {
  assert.match(actionSource, /template_version_snapshot/);
  assert.match(actionSource, /survey-evidence/);
  assert.match(actionSource, /ensureSurveyFailureFindings/);
  assert.match(actionSource, /existingAnswerIds/);
  assert.match(actionSource, /SURVEY_EVIDENCE_REQUIRED/);
});
