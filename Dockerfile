FROM node:13.14.0

COPY package.json /app/package.json
COPY index.js /app/index.js

WORKDIR /app

RUN npm install

CMD [ "node", "index.js" ]