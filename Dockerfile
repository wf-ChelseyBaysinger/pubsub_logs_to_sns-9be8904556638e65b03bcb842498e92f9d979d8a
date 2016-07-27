FROM ubuntu:14.04

RUN apt-get update
RUN apt-get dist-upgrade -y
# Install node
RUN apt-get install -y nodejs npm

COPY . /src
RUN cd /src; npm install
RUN cd /src; npm run-script updatedb

EXPOSE 8080

CMD ["nodejs", "/src/server.js"]