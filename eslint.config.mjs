import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// The project owns its lint rules so it stops inheriting the config in the
// home directory, which was flagging Next's required metadata export.
const config = [
  { ignores: ["reference/**", ".next/**", "node_modules/**", "next-env.d.ts", "public/scrollcraft/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
