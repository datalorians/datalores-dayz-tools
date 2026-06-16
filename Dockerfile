FROM oven/bun:1-alpine

WORKDIR /app

COPY index.html server.js ./
COPY src ./src
COPY reference ./reference

EXPOSE 80

CMD ["bun", "server.js"]
