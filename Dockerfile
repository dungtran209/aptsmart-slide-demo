# APTsmart Slide — 1 dịch vụ: Node 20 + LibreOffice (xuất PDF) + font
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# libreoffice-impress: chuyển PPTX → PDF; fonts-liberation thay thế Arial (cùng kích thước chữ) để PDF không lệch dòng
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-impress fonts-liberation fonts-dejavu-core fonts-noto-core fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .

ENV NODE_ENV=production \
    PORT=10000 \
    DATA_DIR=/tmp/aptsmart-data
EXPOSE 10000
USER node
CMD ["node", "src/server.js"]
