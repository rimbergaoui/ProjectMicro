const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { PrismaClient } = require("@prisma/client");
const { Kafka } = require('kafkajs');

const prisma = new PrismaClient();
const orderProtoPath = "./order.proto";

const orderProtoDefinition = protoLoader.loadSync(orderProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const orderProto = grpc.loadPackageDefinition(orderProtoDefinition).Order;

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();

async function runKafka() {
  await producer.connect();
}

runKafka().catch(console.error);

const orderService = {
  searchOrders: async (call, callback) => {
    const { query } = call.request;
    try {
      const orders = await prisma.order.findMany();
      await producer.send({
        topic: 'order-topic',
        messages: [{ value: 'Orders searched' }],
      });
      callback(null, { orders: orders });
    } catch (error) {
      callback(error);
    }
  },
  createOrder: async (call, callback) => {
    const { name, description } = call.request;
    try {
      const createdOrder = await prisma.order.create({
        data: {
          name,
          description,
        },
      });
      await producer.send({
        topic: 'order-topic',
        messages: [{ value: `Order created: ${JSON.stringify(createdOrder)}` }],
      });
      callback(null, { order: createdOrder });
    } catch (error) {
      callback({ code: 500, message: "Internal server error" });
    }
  },
};

const server = new grpc.Server();
server.addService(orderProto.OrderService.service, orderService);
const port = 50052;
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error("Échec de la liaison du serveur:", err);
      return;
    }
    console.log(`Le serveur s'exécute sur le port ${port}`);
    server.start();
  }
);
