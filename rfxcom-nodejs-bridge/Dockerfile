ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install requirements for add-on including build dependencies for native modules
RUN \
  apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    linux-headers \
    udev

# Copy package.json and install dependencies
COPY package.json /app/
WORKDIR /app
RUN npm install --production

# Copy data for add-on
COPY app.js /app/
COPY mqtt_helper.js /app/
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
