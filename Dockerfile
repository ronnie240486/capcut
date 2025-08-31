FROM node:18

# diretório de trabalho dentro do container
WORKDIR /app

# copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --omit=dev

# copiar o restante dos arquivos
COPY . .

# expor a porta
EXPOSE 8080

# comando padrão
CMD ["npm", "start"]
