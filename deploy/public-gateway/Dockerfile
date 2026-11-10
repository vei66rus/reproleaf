FROM node:22-slim
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=10001:10001 src/*.mjs ./src/
COPY --chown=10001:10001 cases ./cases
COPY --chown=10001:10001 packs ./packs
COPY --chown=10001:10001 examples ./examples
COPY --chown=10001:10001 deploy/public-gateway/launch.mjs ./deploy/public-gateway/launch.mjs
COPY LICENSE ./LICENSE
USER 10001:10001
EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4180/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","deploy/public-gateway/launch.mjs"]
