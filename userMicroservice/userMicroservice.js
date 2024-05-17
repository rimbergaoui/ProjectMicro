const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { PrismaClient } = require("@prisma/client");
const { Kafka } = require('kafkajs');

const prisma = new PrismaClient();
const userProtoPath = "./user.proto";
const userProtoDefinition = protoLoader.loadSync(userProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const userProto = grpc.loadPackageDefinition(userProtoDefinition).User;

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();

async function runKafka() {
  await producer.connect();
}

runKafka().catch(console.error);

const userService = {
  searchUsers: async (call, callback) => {
    const { query } = call.request;
    try {
      const users = await prisma.user.findMany();
      await producer.send({
        topic: 'user-topic',
        messages: [{ value: 'Users searched' }],
      });
      callback(null, { users: users });
    } catch (error) {
      callback(error);
    }
  },

  createUser: async (call, callback) => {
    const { name, prenom } = call.request;
    try {
      const createUser = await prisma.user.create({
        data: {
          name,
          prenom,
        },
      });
      await producer.send({
        topic: 'user-topic',
        messages: [{ value: `User created: ${JSON.stringify(createUser)}` }],
      });
      callback(null, { user: createUser });
    } catch (error) {
      callback({ code: 500, message: "Internal server error" });
    }
  },
};

const server = new grpc.Server();
server.addService(userProto.UserService.service, userService);
const port = 50051;
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error("Failed to bind server:", err);
      return;
    }
    console.log(`Server is running on port ${port}`);
    server.start();
  }
);
