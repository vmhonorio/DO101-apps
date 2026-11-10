# Jornal de Matinhos - imagem para deploy no OpenShift
#
# Build local:   docker build -t matinhos-jornal .
# Execução:      docker run -p 8080:8080 matinhos-jornal
#
# A imagem roda como usuário sem privilégios e aceita qualquer UID arbitrário
# (padrão do OpenShift), pois os diretórios usados pertencem ao grupo root (0).

FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest

LABEL name="matinhos-jornal" \
      description="Jornal digital de classificados e serviços de Matinhos (PR)" \
      io.k8s.display-name="Jornal de Matinhos" \
      io.openshift.expose-services="8080:http"

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/opt/app-root/data

WORKDIR /opt/app-root/src

# Instala somente dependências de produção, aproveitando o cache de camadas.
COPY --chown=1001:0 package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=1001:0 app.js ./
COPY --chown=1001:0 data ./data
COPY --chown=1001:0 public ./public

# Diretório de dados gravável por qualquer UID do grupo root (monte um volume aqui).
RUN mkdir -p "$DATA_DIR" && chgrp -R 0 "$DATA_DIR" /opt/app-root/src && chmod -R g=u "$DATA_DIR" /opt/app-root/src

USER 1001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://localhost:8080/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "app.js"]
