import index from "./index.html";

const server = Bun.serve({
    port: 3000,
    routes: {
        "/": index
    },
    async fetch(req, server) {
        const url = new URL(req.url);
        const path = url.pathname;

        if(await Bun.file("." + path).exists()) {
            return new Response(Bun.file("." + path));
        } else {
            console.log(`Not found: ${path}`);
            return new Response("Not found", { status: 404 });
        }
    }
});

console.log(`Server running at http://localhost:${server.port}`);