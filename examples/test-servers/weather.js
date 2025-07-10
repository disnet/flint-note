#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Create the MCP server
const server = new McpServer({
  name: 'weather-server',
  version: '1.0.0'
});

// Mock weather data
const weatherData = {
  'new york': {
    temperature: 22,
    condition: 'sunny',
    humidity: 65,
    windSpeed: 12
  },
  london: {
    temperature: 15,
    condition: 'cloudy',
    humidity: 80,
    windSpeed: 8
  },
  tokyo: {
    temperature: 28,
    condition: 'rainy',
    humidity: 85,
    windSpeed: 15
  },
  paris: {
    temperature: 18,
    condition: 'partly cloudy',
    humidity: 70,
    windSpeed: 10
  }
};

// Register the get_weather tool
server.tool(
  'get_weather',
  'Get current weather for a city',
  {
    location: z.string().describe('The city name to get weather for')
  },
  async ({ location }) => {
    const city = location.toLowerCase();
    const weather = weatherData[city];

    if (!weather) {
      return {
        content: [
          {
            type: 'text',
            text: `Weather data not available for ${location}. Available cities: ${Object.keys(weatherData).join(', ')}`
          }
        ]
      };
    }

    const weatherReport = `Current weather in ${location}:
- Temperature: ${weather.temperature}°C
- Condition: ${weather.condition}
- Humidity: ${weather.humidity}%
- Wind Speed: ${weather.windSpeed} km/h`;

    return {
      content: [
        {
          type: 'text',
          text: weatherReport
        }
      ]
    };
  }
);

// Register the get_forecast tool
server.tool(
  'get_forecast',
  'Get weather forecast for a city',
  {
    location: z.string().describe('The city name to get forecast for'),
    days: z.number().min(1).max(7).default(3).describe('Number of days to forecast')
  },
  async ({ location, days = 3 }) => {
    const city = location.toLowerCase();
    const baseWeather = weatherData[city];

    if (!baseWeather) {
      return {
        content: [
          {
            type: 'text',
            text: `Weather data not available for ${location}. Available cities: ${Object.keys(weatherData).join(', ')}`
          }
        ]
      };
    }

    const forecast = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      // Generate some variation in the forecast
      const tempVariation = (Math.random() - 0.5) * 6; // ±3 degrees
      const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'];
      const condition =
        i === 0
          ? baseWeather.condition
          : conditions[Math.floor(Math.random() * conditions.length)];

      forecast.push({
        date: date.toDateString(),
        temperature: Math.round(baseWeather.temperature + tempVariation),
        condition: condition,
        humidity: baseWeather.humidity + Math.floor((Math.random() - 0.5) * 20),
        windSpeed: baseWeather.windSpeed + Math.floor((Math.random() - 0.5) * 10)
      });
    }

    const forecastText = `${days}-day weather forecast for ${location}:

${forecast
  .map(
    (day) =>
      `${day.date}:
  - Temperature: ${day.temperature}°C
  - Condition: ${day.condition}
  - Humidity: ${day.humidity}%
  - Wind Speed: ${day.windSpeed} km/h`
  )
  .join('\n\n')}`;

    return {
      content: [
        {
          type: 'text',
          text: forecastText
        }
      ]
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with the MCP protocol
  console.error('Weather MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
