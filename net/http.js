// src/net/http.js
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

const agent = process.env.PROXY_URL
  ? new HttpsProxyAgent(process.env.PROXY_URL)
  : undefined;

const http = axios.create({
  timeout: 15000,
  proxy: false,          // IMPORTANT: disable axios built-in proxy
  httpsAgent: agent,     // let the agent do the proxying
});

module.exports = { http };
