import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeText } from "../../dist.lib/api.js";


test("Normalize text (volatile tokens)", () => {
    assert.deepEqual(normalizeText("  Save 20% on ember1093  "), "save #% on", "Invalid normalization (digit runs, generated token)");
    assert.deepEqual(normalizeText("css-1x2y3z"), "", "Invalid normalization (generated class name)");
    assert.deepEqual(normalizeText("Sign   UP"), "sign up", "Invalid normalization (case, whitespace)");
});