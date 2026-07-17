FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# No exposed port — this is a background worker, not a web service.
CMD ["npm", "start"]
