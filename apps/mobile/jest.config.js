/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  // Prefix match (no trailing "/") so e.g. expo-modules-core, expo-secure-store
  // and react-native-paper are all transformed — mirrors jest-expo's docs.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|@yodkai/.*))",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/test/**",
    "!**/*.d.ts",
  ],
};
