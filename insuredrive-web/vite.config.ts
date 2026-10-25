import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { publicAuthConfig } from "./src/lib/auth-config";
import { securityHeaders } from "./security-headers";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const config = publicAuthConfig(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (process.env.NETLIFY === "true" && !config.valid)
    throw Error(
      "Netlify build requires valid VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY build environment variables. Use the existing project's public configuration, then redeploy.",
    );
  if (
    (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY) &&
    !config.valid
  )
    throw Error(config.reason);
  for (const [name, value] of Object.entries(env)) {
    let privileged = value.startsWith("sb_secret_");
    try {
      privileged ||=
        JSON.parse(atob(value.split(".")[1])).role === "service_role";
    } catch {
      /* not JWT */
    }
    if (
      privileged ||
      /(?:SERVICE_ROLE|PRIVATE_KEY|SECRET|PASSWORD)/i.test(name)
    )
      throw Error(
        "A privileged value or secret variable is present in public VITE_ configuration. Remove it before starting or building.",
      );
  }
  const headers = securityHeaders(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  return {
    plugins: [
      react(),
      {
        name: "tenuli-release-security",
        apply: "build",
        transformIndexHtml() {
          return [
            {
              tag: "meta",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content: headers["Content-Security-Policy"].replace(
                  "; frame-ancestors 'none'",
                  "",
                ),
              },
              injectTo: "head-prepend",
            },
          ];
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "_headers",
            source:
              "/*\n" +
              Object.entries(headers)
                .map(([k, v]) => `  ${k}: ${v}`)
                .join("\n") +
              "\n  Strict-Transport-Security: max-age=31536000\n",
          });
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      allowedHosts: ["terminal.local"],
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
    preview: { host: "127.0.0.1", headers },
    build: { target: "es2022", emptyOutDir: true, sourcemap: false },
  };
});
