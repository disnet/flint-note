FROM node:lts-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies without triggering any unwanted scripts
RUN npm install --ignore-scripts

# Copy all source code
COPY . .

# Build the application
RUN npm run build

# Expose port if needed (not specified, so using none)

# Command to run the server
CMD [ "node", "dist/index.js" ]
