FROM node:18

WORKDIR /app

RUN apt-get update && apt-get install -y software-properties-common && \
    add-apt-repository ppa:savoury1/ffmpeg6 -y && \
    apt-get update && apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
