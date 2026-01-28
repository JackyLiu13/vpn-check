import 'dotenv/config';
import { CohereClientV2 } from 'cohere-ai';

// Load env from src/.env
import { config } from 'dotenv';
config({ path: './src/.env' });

const cohere = new CohereClientV2({
    token: process.env.cohere_key
});

(async () => {
    console.log('Starting Cohere stream test...\n');
    console.log('---Response---\n');

    const startTime = Date.now();
    let chunkCount = 0;
    let firstChunkTime = null;

    const stream = await cohere.chatStream({
        model: 'command-a-03-2025',
        temperature: 0,
        messages: [
            {
                role: 'user',
                content: 'Tell me about Cohere',
            },
        ],
    });

    for await (const chatEvent of stream) {
        if (chatEvent.type === 'content-delta') {
            if (firstChunkTime === null) {
                firstChunkTime = Date.now() - startTime;
                console.log(`[First chunk arrived after ${firstChunkTime}ms]\n`);
            }
            chunkCount++;
            process.stdout.write(chatEvent.delta?.message?.content?.text || '');
        }
    }

    const totalTime = Date.now() - startTime;
    console.log('\n\n---Stats---');
    console.log(`Total chunks: ${chunkCount}`);
    console.log(`Time to first chunk: ${firstChunkTime}ms`);
    console.log(`Total time: ${totalTime}ms`);
})();
