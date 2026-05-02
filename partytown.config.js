import { defineConfig } from "partytown";

export default defineConfig({
    dest: process.env.VERCEL ? "./dist/~partytown" : "./public/~partytown",
    forward: ["dataLayer.push", "gtag", "fbq", "snaptr", "adsbygoogle"],
    resolveUrl: (url) => {
        if (url.hostname === "pagead2.googlesyndication.com" ||
            url.hostname === "googleads.g.doubleclick.net" ||
            url.hostname === "adservice.google.com") {
            return {
                ...url,
                host: "https://www.googletagmanager.com",
                pathname: "/gtag/js",
            };
        }
        return url;
    },
    lib: "~partytown",
    logCalls: false,
    logScriptCalls: false,
});
