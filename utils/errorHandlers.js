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