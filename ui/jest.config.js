process.env.NODE_ENV = process.env.NODE_ENV || "test";

module.exports = {
  rootDir: __dirname,
  moduleDirectories: ["node_modules"],
  moduleFileExtensions: ["web.jsx", "web.js", "wasm", "jsx", "js", "json"],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/__jest__/fileMock.js",
    "\\.(css|less|sass|scss)$": "<rootDir>/__jest__/styleMock.js",
    "^@taskcluster/ui$": "/home/eijemoz/code/taskcluster/ui/src",
  },
  bail: true,
  collectCoverageFrom: ["src/**/*.{mjs,jsx,js}"],
  testEnvironment: "jsdom",
  testRegex: null,
  verbose: false,
  transform: {
    "\\.(mjs|jsx|js)$": "<rootDir>/__jest__/transformer.js",
    "^.+\\.(js|jsx)$": "babel-jest",
    "\\.graphql$": "jest-transform-graphql",
  },
  testMatch: [
    "<rootDir>/src/**/*.test.(js|jsx)",
    "<rootDir>/tests/unit/**/*.test.(ts)",
  ],
  setupFilesAfterEnv: ["./jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!is-absolute-url|@taskcluster/client-web)",
  ],
};
