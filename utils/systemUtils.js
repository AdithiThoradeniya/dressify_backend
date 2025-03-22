import os from 'os';

// Debugging utility functions
export const logSystemInfo = () => {
  console.log('Current working directory:', process.cwd());
  console.log('Temp directory:', os.tmpdir());
  console.log('Platform:', process.platform);
};

export const setupErrorHandlers = () => {
  // Error handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (process.env.NODE_ENV !== 'production') process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (process.env.NODE_ENV !== 'production') process.exit(1);
  });
};