export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  defaultShell: process.env.SHELL || '/bin/zsh',
  defaultCwd: process.env.DEFAULT_CWD || process.cwd(),
};
