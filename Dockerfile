# Optional OCI adapter; Render continues to use its native Node.js Blueprint.
# No app-level changes or platform secrets are baked into the image.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    LUMEN_DEMO=0 \
    PORT=3000 \
    LUMEN_DB_PATH=/data/lumen.sqlite \
    LUMEN_STORAGE_ROOT=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(x=>{if(!x?.db)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm","start"]
