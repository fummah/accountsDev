module.exports = {
  version: 1,
  description: 'Initial database schema baseline - all tables created by individual models',
  up: () => {
    // No schema changes needed.
    // All tables are created by individual model's createTable() at require time.
    // This migration marks the starting point for version tracking.
  }
};
