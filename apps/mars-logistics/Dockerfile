# Sitio estático simple (un solo index.html, sin build) — se sirve tal cual.
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY index.html ./
EXPOSE 3000
CMD ["sh", "-c", "serve -s . -l ${PORT:-3000}"]
