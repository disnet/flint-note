import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
  }>;
}

class WeatherMCPServer {
  private server: Server;
  private mockWeatherData: Map<string, WeatherData> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'weather-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.initializeMockData();
    this.setupHandlers();
  }

  private initializeMockData(): void {
    this.mockWeatherData.set('new york', {
      location: 'New York, NY',
      temperature: 22,
      condition: 'Partly cloudy',
      humidity: 65,
      windSpeed: 12,
      forecast: [
        { day: 'Today', high: 25, low: 18, condition: 'Partly cloudy' },
        { day: 'Tomorrow', high: 28, low: 20, condition: 'Sunny' },
        { day: 'Wednesday', high: 24, low: 16, condition: 'Rainy' }
      ]
    });

    this.mockWeatherData.set('london', {
      location: 'London, UK',
      temperature: 15,
      condition: 'Overcast',
      humidity: 80,
      windSpeed: 8,
      forecast: [
        { day: 'Today', high: 17, low: 12, condition: 'Overcast' },
        { day: 'Tomorrow', high: 19, low: 14, condition: 'Light rain' },
        { day: 'Wednesday', high: 16, low: 11, condition: 'Cloudy' }
      ]
    });

    this.mockWeatherData.set('tokyo', {
      location: 'Tokyo, Japan',
      temperature: 26,
      condition: 'Sunny',
      humidity: 55,
      windSpeed: 6,
      forecast: [
        { day: 'Today', high: 28, low: 22, condition: 'Sunny' },
        { day: 'Tomorrow', high: 30, low: 24, condition: 'Partly cloudy' },
        { day: 'Wednesday', high: 27, low: 21, condition: 'Thunderstorms' }
      ]
    });
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather information for a location',
            inputSchema: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The location to get weather for'
                }
              },
              required: ['location']
            }
          },
          {
            name: 'get_forecast',
            description: 'Get weather forecast for a location',
            inputSchema: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The location to get forecast for'
                },
                days: {
                  type: 'number',
                  description: 'Number of days to forecast (default: 3)',
                  default: 3
                }
              },
              required: ['location']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'get_weather') {
        const location = (args?.location as string)?.toLowerCase();
        const weatherData = this.mockWeatherData.get(location);

        if (!weatherData) {
          return {
            content: [
              {
                type: 'text',
                text: `Weather data not available for "${args?.location}". Available locations: New York, London, Tokyo`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Current weather in ${weatherData.location}:
Temperature: ${weatherData.temperature}°C
Condition: ${weatherData.condition}
Humidity: ${weatherData.humidity}%
Wind Speed: ${weatherData.windSpeed} km/h`
            }
          ]
        };
      }

      if (name === 'get_forecast') {
        const location = (args?.location as string)?.toLowerCase();
        const days = (args?.days as number) || 3;
        const weatherData = this.mockWeatherData.get(location);

        if (!weatherData) {
          return {
            content: [
              {
                type: 'text',
                text: `Weather data not available for "${args?.location}". Available locations: New York, London, Tokyo`
              }
            ]
          };
        }

        const forecast = weatherData.forecast.slice(0, days);
        const forecastText = forecast
          .map((day) => `${day.day}: ${day.high}°C/${day.low}°C - ${day.condition}`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `${days}-day forecast for ${weatherData.location}:\n${forecastText}`
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Weather MCP server started'); // Use stderr for logging
  }
}

if (require.main === module) {
  const server = new WeatherMCPServer();
  server.run().catch(console.error);
}

export default WeatherMCPServer;
