export default {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || "127.0.0.1",
  },

  env: process.env.NODE_ENV || "development",

  db: {
    path: process.env.DB_PATH || "/tmp/database.sqlite",
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "combined",
  },

  awsCliConfig: {
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "S3RVER",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "S3RVER",
    },
    endpoint: process.env.AWS_ENDPOINT || "http://127.0.0.1:4568",
  },

  awsBucketName: process.env.AWS_S3_BUCKET_NAME || "test-bucket",
};
