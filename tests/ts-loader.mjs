import fs from "node:fs";
import path from "node:path";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "src");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function resolveWithTsExtensions(candidatePath) {
  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath;
  }
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    const withExt = candidatePath + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }
  for (const idx of ["index.ts", "index.tsx", "index.js"]) {
    const idxPath = path.join(candidatePath, idx);
    if (fs.existsSync(idxPath) && fs.statSync(idxPath).isFile()) {
      return idxPath;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = path.join(srcDir, specifier.slice(2));
      const found = resolveWithTsExtensions(target);
      if (found) {
        return { url: pathToFileURL(found).href, shortCircuit: true };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = path.resolve(parentDir, specifier);
      const found = resolveWithTsExtensions(target);
      if (found) {
        return { url: pathToFileURL(found).href, shortCircuit: true };
      }
    }
    if (specifier === "next/server") {
      const target = path.join(rootDir, "node_modules", "next", "server.js");
      if (fs.existsSync(target)) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    if (specifier === "next/headers") {
      const target = path.join(rootDir, "node_modules", "next", "headers.js");
      if (fs.existsSync(target)) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
      const filePath = fileURLToPath(url);
      const source = fs.readFileSync(filePath, "utf-8");
      const transpiled = ts.transpileModule(source, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return {
        format: "module",
        source: transpiled.outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
