# Use uma imagem leve com Node
FROM node:22-slim

# Atualiza pacotes
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Cria diretório da aplicação
WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./

RUN npm install

# Copia o resto do projeto
COPY . .

# Porta que Railway vai expor automaticamente
EXPOSE 3000

# Inicia a aplicação
CMD ["npm", "run", "start"]
