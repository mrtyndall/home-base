export const MCP_API_ERROR = Symbol("home-base-mcp-api-error");

export type McpApiError = {
  [MCP_API_ERROR]: true;
  status: number;
};

export function mcpApiError(status: number): McpApiError {
  return { [MCP_API_ERROR]: true, status };
}

export function toToolResult(data: unknown) {
  if (isMcpApiError(data)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: {
              code: "home_base_api_error",
              message: "Home Base API request failed.",
              status: data.status,
            },
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function isMcpApiError(data: unknown): data is McpApiError {
  return typeof data === "object" && data !== null && MCP_API_ERROR in data;
}
