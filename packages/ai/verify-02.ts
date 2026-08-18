import { createModels, fauxAssistantMessage, fauxProvider } from "./src/index.ts";

const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([fauxAssistantMessage("Hello from the faux model!")]);

const model = faux.getModel();
const stream = models.streamSimple(model, {
    messages: [{ role: "user", content: "Hi there", timestamp: Date.now() }],
});

for await (const event of stream) {
    if (event.type === "text_delta") process.stdout.write(event.delta);
}
const message = await stream.result();
console.log(`\nstopReason: ${message.stopReason}, output tokens: ${message.usage.output}`);
