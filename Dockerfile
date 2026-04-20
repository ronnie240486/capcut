FROM node:22-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Adiciona essa linha
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
