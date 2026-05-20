FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY .env.example ./

EXPOSE 3001
CMD ["npm", "run", "start"]
