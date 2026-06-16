FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY src /usr/share/nginx/html/src
COPY reference /usr/share/nginx/html/reference
RUN printf '%s\n' \
    'server {' \
    '    listen 80;' \
    '    root /usr/share/nginx/html;' \
    '    index index.html;' \
    '    location / { try_files $uri $uri/ /index.html; }' \
    '}' > /etc/nginx/conf.d/default.conf
