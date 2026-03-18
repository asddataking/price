import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTs from "eslint-config-next/typescript.js";

const sanitizeExtends = (config) => {
  if (!config || typeof config !== "object") return config;
  const cfg = config;
  if (!Array.isArray(cfg.extends)) return config;

  // eslint flat-config compatibility treats `C:\...` as plugin-like input because of `:`.
  // Strip drive-letter path entries from `extends` and keep plugin entries.
  const cleanedExtends = cfg.extends.filter((v) => {
    if (typeof v !== "string") return true;
    return !/^[a-zA-Z]:\\/.test(v);
  });

  return { ...config, extends: cleanedExtends };
};

export default defineConfig([sanitizeExtends(nextVitals), nextTs]);
