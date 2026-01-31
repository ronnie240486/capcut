FROM node:18

# Diretório de trabalho
WORKDIR /app

# Instala FFmpeg 6.x via PPA moderna
RUN apt-get update && apt-get install -y software-properties-common && \
    add-apt-repository ppa:savoury1/ffmpeg6 -y && \
    apt-get update && apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm install --omit=dev

# Copia o restante dos arquivos
COPY . .

# Expor porta
EXPOSE 8080

# Comando padrão
CMD ["npm", "start"]
