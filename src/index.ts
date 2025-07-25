#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchAndFetchArticles, getFullAbstract, getFullText, searchPubMed, getArticleDetails, exportRIS, getCitationCounts, optimizeSearchQuery } from "./pubmed-api.js";

// Create MCP server
const server = new McpServer({
  name: "pubmed-mcp-server",
  version: "1.0.0"
});

// Tool: Search PubMed articles
server.registerTool(
  "search_pubmed",
  {
    title: "Search PubMed",
    description: "Search PubMed database for biomedical literature. Returns detailed article information including abstracts and PMIDs.",
    inputSchema: {
      query: z.string().describe("Search query for PubMed database"),
      maxResults: z.number().optional().default(10).describe("Maximum number of results to return (default: 10, max: 100)")
    }
  },
  async ({ query, maxResults = 10 }) => {
    try {
      // Limit maxResults to prevent abuse
      const limitedMax = Math.min(maxResults, 100);
      
      // First get search results to show total hit count
      const searchResult = await searchPubMed(query, limitedMax);
      
      if (searchResult.idList.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No articles found for query: "${query}"\n\nTotal search hits: ${searchResult.count}`
          }]
        };
      }
      
      // Then get detailed article information
      const articles = await getArticleDetails(searchResult.idList);
      
      // Format articles for display
      const formattedResults = articles.map((article, index) => {
        const authorsText = article.authors.length > 0 
          ? article.authors.slice(0, 3).join(", ") + (article.authors.length > 3 ? ", et al." : "")
          : "Unknown authors";
        
        let result = `**${index + 1}. ${article.title}**\n`;
        result += `Authors: ${authorsText}\n`;
        result += `Journal: ${article.journal}\n`;
        result += `Publication Date: ${article.publicationDate}\n`;
        result += `PMID: ${article.pmid}\n`;
        
        if (article.doi) {
          result += `DOI: ${article.doi}\n`;
        }
        
        if (article.pmcId) {
          result += `PMC ID: ${article.pmcId}\n`;
        }
        
        result += `URL: ${article.url}\n`;
        
        if (article.abstract) {
          const truncatedAbstract = article.abstract.length > 500 
            ? article.abstract.substring(0, 500) + "... (Use get_full_abstract for complete abstract)"
            : article.abstract;
          result += `\nAbstract: ${truncatedAbstract}\n`;
        }
        
        return result;
      }).join("\n" + "=".repeat(80) + "\n\n");
      
      // Extract PMIDs for easy reference
      const pmids = articles.map(a => a.pmid);
      
      // Create comprehensive search summary
      let searchSummary = `📊 **Search Results Summary**\n`;
      searchSummary += `Query: "${query}"\n`;
      searchSummary += `Total articles found: **${searchResult.count.toLocaleString()}**\n`;
      searchSummary += `Showing: **${articles.length}** articles (requested: ${limitedMax})\n`;
      
      if (searchResult.queryTranslation) {
        searchSummary += `Query translation: ${searchResult.queryTranslation}\n`;
      }
      
      searchSummary += `\nPMIDs: ${pmids.join(", ")}\n`;
      
      return {
        content: [{
          type: "text",
          text: `${searchSummary}\n${"=".repeat(100)}\n\n${formattedResults}\n\n💡 Use get_full_abstract with PMIDs for complete abstracts\n💡 Use get_full_text with PMC IDs for full article text`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error searching PubMed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get full abstract
server.registerTool(
  "get_full_abstract",
  {
    title: "Get Full Abstract",
    description: "Get complete, untruncated abstracts for specific PubMed articles by their PMID(s). Useful when search results show truncated abstracts.",
    inputSchema: {
      pmids: z.array(z.string()).describe("Array of PubMed IDs (PMIDs) to get full abstracts for")
    }
  },
  async ({ pmids }) => {
    try {
      if (pmids.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No PMIDs provided"
          }],
          isError: true
        };
      }
      
      // Limit to prevent abuse
      const limitedPmids = pmids.slice(0, 20);
      
      const abstracts = await getFullAbstract(limitedPmids);
      
      if (abstracts.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No abstracts found for PMIDs: ${limitedPmids.join(", ")}`
          }]
        };
      }
      
      // Format abstracts for display
      const formattedResults = abstracts.map((article, index) => {
        const authorsText = article.authors.length > 0 
          ? article.authors.join(", ")
          : "Unknown authors";
        
        let result = `**${index + 1}. ${article.title}**\n`;
        result += `Authors: ${authorsText}\n`;
        result += `Journal: ${article.journal}\n`;
        result += `Publication Date: ${article.publicationDate}\n`;
        result += `PMID: ${article.pmid}\n`;
        
        if (article.doi) {
          result += `DOI: ${article.doi}\n`;
        }
        
        if (article.pmcId) {
          result += `PMC ID: ${article.pmcId}\n`;
        }
        
        if (article.fullAbstract) {
          result += `\n**Full Abstract:**\n${article.fullAbstract}\n`;
        } else {
          result += `\nNo abstract available for this article.\n`;
        }
        
        return result;
      }).join("\n" + "=".repeat(80) + "\n\n");
      
      return {
        content: [{
          type: "text",
          text: `Full abstracts for PMIDs: ${limitedPmids.join(", ")}\n\n${formattedResults}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error fetching full abstracts: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get full text from PMC
server.registerTool(
  "get_full_text",
  {
    title: "Get Full Text",
    description: "Get complete full text of articles from PubMed Central (PMC) by PMC ID. Uses E-utilities API for improved compatibility with PMC articles.",
    inputSchema: {
      pmcIds: z.array(z.string()).describe("Array of PMC IDs (e.g., 'PMC1234567' or '1234567') to get full text for")
    }
  },
  async ({ pmcIds }) => {
    try {
      if (pmcIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No PMC IDs provided"
          }],
          isError: true
        };
      }
      
      // Limit to prevent abuse
      const limitedPmcIds = pmcIds.slice(0, 10);
      
      const fullTexts = await getFullText(limitedPmcIds);
      
      if (fullTexts.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No full texts found for PMC IDs: ${limitedPmcIds.join(", ")}\n\nNote: Full text is only available for articles available in PMC. The server now uses E-utilities API for better compatibility.`
          }]
        };
      }
      
      // Format full texts for display
      const formattedResults = fullTexts.map((article, index) => {
        let result = `**${index + 1}. ${article.title}**\n`;
        result += `PMID: ${article.pmid}\n`;
        result += `PMC ID: ${article.pmcId}\n\n`;
        
        // Show sections if available
        if (article.sections.length > 0) {
          result += `**Sections:**\n`;
          article.sections.forEach((section, sectionIndex) => {
            result += `\n**${section.title}**\n${section.content}\n`;
          });
        } else {
          // Fallback to full text if sections are not properly parsed
          result += `**Full Text:**\n${article.fullText}\n`;
        }
        
        return result;
      }).join("\n" + "=".repeat(100) + "\n\n");
      
      return {
        content: [{
          type: "text",
          text: `Full text for PMC IDs: ${limitedPmcIds.join(", ")}\n\n${formattedResults}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error fetching full texts: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Export citations in RIS format
server.registerTool(
  "export_ris",
  {
    title: "Export RIS Format",
    description: "Export PubMed citations in RIS format for use with reference management software (Zotero, Mendeley, EndNote, etc.). Uses NCBI Literature Citation Exporter API.",
    inputSchema: {
      pmids: z.string().describe("Comma-separated list of PubMed IDs (PMIDs) to export in RIS format (e.g., '36038128, 30105375')")
    }
  },
  async ({ pmids }) => {
    try {
      if (!pmids || pmids.trim().length === 0) {
        return {
          content: [{
            type: "text",
            text: "No PMIDs provided for RIS export"
          }],
          isError: true
        };
      }
      
      // Parse comma-separated PMIDs
      const pmidArray = pmids.split(',').map(id => id.trim()).filter(id => id.length > 0);
      
      if (pmidArray.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No valid PMIDs found in input"
          }],
          isError: true
        };
      }
      
      // Limit to prevent abuse and respect API rate limits
      const limitedPmids = pmidArray.slice(0, 50);
      
      if (pmidArray.length > 50) {
        console.warn(`Requested ${pmidArray.length} PMIDs, limiting to 50 for RIS export`);
      }
      
      const result = await exportRIS(limitedPmids);
      
      if (result.successCount === 0) {
        return {
          content: [{
            type: "text",
            text: `Failed to export any citations in RIS format for PMIDs: ${limitedPmids.join(", ")}\n\nErrors:\n${result.errors.join("\n")}`
          }],
          isError: true
        };
      }
      
      // Format the response
      let responseText = `📄 **RIS Export Results**\n\n`;
      responseText += `Total PMIDs requested: ${limitedPmids.length}\n`;
      responseText += `Successfully exported: ${result.successCount}\n`;
      
      if (result.errorCount > 0) {
        responseText += `Failed: ${result.errorCount}\n`;
        responseText += `\nErrors:\n${result.errors.join("\n")}\n`;
      }
      
      responseText += `\n${"=".repeat(80)}\n`;
      responseText += `**RIS FORMAT DATA**\n`;
      responseText += `${"=".repeat(80)}\n\n`;
      responseText += result.risData;
      
      responseText += `\n${"=".repeat(80)}\n`;
      responseText += `**Usage Instructions:**\n`;
      responseText += `1. Copy the RIS format data above\n`;
      responseText += `2. Save as a .ris file (e.g., "citations.ris")\n`;
      responseText += `3. Import into your reference manager:\n`;
      responseText += `   - Zotero: File → Import\n`;
      responseText += `   - Mendeley: File → Import → RIS\n`;
      responseText += `   - EndNote: File → Import → File\n`;
      responseText += `   - Papers: Import → From File\n`;
      responseText += `\n💡 **Input format**: Use comma-separated PMIDs (e.g., "36038128, 30105375")\n`;
      
      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error exporting RIS format: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get citation counts
server.registerTool(
  "get_citation_counts",
  {
    title: "Get Citation Counts",
    description: "Get citation counts for specific PubMed articles using NCBI elink API. Shows how many times each article has been cited by other PubMed articles.",
    inputSchema: {
      pmids: z.string().describe("Comma-separated list of PubMed IDs (PMIDs) to get citation counts for (e.g., '36038128, 30105375')")
    }
  },
  async ({ pmids }) => {
    try {
      if (!pmids || pmids.trim().length === 0) {
        return {
          content: [{
            type: "text",
            text: "No PMIDs provided for citation count analysis"
          }],
          isError: true
        };
      }
      
      // Parse comma-separated PMIDs
      const pmidArray = pmids.split(',').map(id => id.trim()).filter(id => id.length > 0);
      
      if (pmidArray.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No valid PMIDs found in input"
          }],
          isError: true
        };
      }
      
      // Limit to prevent abuse and respect API rate limits
      const limitedPmids = pmidArray.slice(0, 20);
      
      if (pmidArray.length > 20) {
        console.warn(`Requested ${pmidArray.length} PMIDs, limiting to 20 for citation count analysis`);
      }
      
      const results = await getCitationCounts(limitedPmids);
      
      if (results.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No citation data found for PMIDs: ${limitedPmids.join(", ")}`
          }]
        };
      }
      
      // Format the response
      let responseText = `📊 **Citation Count Analysis**\n\n`;
      responseText += `Analyzed PMIDs: ${limitedPmids.length}\n`;
      
      // Calculate total citations
      const totalCitations = results.reduce((sum, result) => sum + result.citationCount, 0);
      responseText += `Total citations found: ${totalCitations}\n`;
      
      responseText += `\n${"=".repeat(80)}\n\n`;
      
      // Format individual results
      const formattedResults = results.map((result, index) => {
        let text = `**${index + 1}. ${result.title}**\n`;
        text += `PMID: ${result.pmid}\n`;
        text += `Citations: **${result.citationCount}**\n`;
        
        if (result.error) {
          text += `⚠️ Error: ${result.error}\n`;
        } else if (result.citationCount > 0) {
          text += `\n📚 **Top citing PMIDs** (showing first 10):\n`;
          const topCitingPmids = result.citingPmids.slice(0, 10);
          topCitingPmids.forEach((citingPmid, citingIndex) => {
            text += `   ${citingIndex + 1}. PMID: ${citingPmid}\n`;
          });
          
          if (result.citingPmids.length > 10) {
            text += `   ... and ${result.citingPmids.length - 10} more citing articles\n`;
          }
        } else {
          text += `ℹ️ No citations found in PubMed database\n`;
        }
        
        return text;
      }).join("\n" + "=".repeat(80) + "\n\n");
      
      responseText += formattedResults;
      
      responseText += `\n${"=".repeat(80)}\n`;
      responseText += `**Notes:**\n`;
      responseText += `• Citation counts are based on PubMed database only\n`;
      responseText += `• May not include all citations from other databases\n`;
      responseText += `• Data is updated periodically by NCBI\n`;
      responseText += `• Analysis limited to 20 PMIDs per request\n`;
      responseText += `\n💡 **Input format**: Use comma-separated PMIDs (e.g., "36038128, 30105375")\n`;
      
      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error getting citation counts: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Optimize search query
server.registerTool(
  "optimize_search_query",
  {
    title: "Optimize Search Query",
    description: "Transform natural language queries into optimized PubMed search queries using MeSH terms, field tags, and boolean operators for more effective and precise searches.",
    inputSchema: {
      query: z.string().describe("Natural language search query to optimize (e.g., 'covid vaccine effectiveness in elderly')")
    }
  },
  async ({ query }) => {
    try {
      if (!query || query.trim().length === 0) {
        return {
          content: [{
            type: "text",
            text: "No search query provided for optimization"
          }],
          isError: true
        };
      }
      
      const result = await optimizeSearchQuery(query.trim());
      
      // Format the response
      let responseText = `🔍 **Search Query Optimization**\n\n`;
      
      responseText += `**Original Query:**\n\`${result.originalQuery}\`\n\n`;
      
      responseText += `**Optimized Query:**\n\`${result.optimizedQuery}\`\n\n`;
      
      responseText += `${"=".repeat(80)}\n\n`;
      
      // Show improvements
      if (result.improvements.length > 0) {
        responseText += `**🎯 Improvements Made:**\n`;
        result.improvements.forEach((improvement, index) => {
          responseText += `${index + 1}. ${improvement}\n`;
        });
        responseText += `\n`;
      }
      
      // Show MeSH terms used
      if (result.meshTermsUsed.length > 0) {
        responseText += `**📚 MeSH Terms Applied:**\n`;
        result.meshTermsUsed.forEach((term, index) => {
          responseText += `• ${term}\n`;
        });
        responseText += `\n`;
      }
      
      // Show field tags used
      if (result.fieldTagsUsed.length > 0) {
        responseText += `**🏷️ Field Tags Used:**\n`;
        const uniqueFieldTags = [...new Set(result.fieldTagsUsed)];
        uniqueFieldTags.forEach((tag, index) => {
          const tagDescription = {
            '[MeSH Terms]': 'Medical Subject Headings',
            '[tw]': 'Text Word (searches titles, abstracts, and keywords)',
            '[ti]': 'Title',
            '[ab]': 'Abstract',
            '[au]': 'Author',
            '[ta]': 'Journal Title',
            '[pt]': 'Publication Type',
            '[pdat]': 'Publication Date'
          };
          responseText += `• ${tag} - ${tagDescription[tag as keyof typeof tagDescription] || 'Field tag'}\n`;
        });
        responseText += `\n`;
      }
      
      // Show estimated results if available
      if (result.estimatedResults !== undefined) {
        responseText += `**📊 Estimated Results:**\n`;
        responseText += `${result.estimatedResults.toLocaleString()} articles found\n\n`;
      }
      
      responseText += `${"=".repeat(80)}\n`;
      responseText += `**💡 Next Steps:**\n`;
      responseText += `1. Copy the optimized query above\n`;
      responseText += `2. Use it with the \`search_pubmed\` tool\n`;
      responseText += `3. Or paste it directly into PubMed's search box\n`;
      responseText += `4. Further refine by adding date ranges, publication types, etc.\n\n`;
      
      responseText += `**🔧 Advanced Options:**\n`;
      responseText += `• Add publication date: \`AND 2020:2023[pdat]\`\n`;
      responseText += `• Filter by publication type: \`AND "Clinical Trial"[pt]\`\n`;
      responseText += `• Limit to humans: \`AND "Humans"[MeSH Terms]\`\n`;
      responseText += `• English language only: \`AND English[la]\`\n`;
      
      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Error optimizing search query: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Resource: PubMed search results
server.registerResource(
  "search-results",
  new ResourceTemplate("pubmed://search/{query}", { list: undefined }),
  {
    title: "PubMed Search Results",
    description: "Search results from PubMed database in JSON format",
    mimeType: "application/json"
  },
  async (uri, params) => {
    const { query } = params as { query: string };
    try {
      const decodedQuery = decodeURIComponent(query);
      const articles = await searchAndFetchArticles(decodedQuery, 10);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(articles, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: errorMessage }, null, 2),
          mimeType: "application/json"
        }]
      };
    }
  }
);

// Prompt: Generate PubMed search query
server.registerPrompt(
  "generate_search_query",
  {
    title: "Generate PubMed Search Query",
    description: "Help generate an effective PubMed search query based on research topic",
    argsSchema: {
      topic: z.string().describe("Research topic or question")
    }
  },
  ({ topic }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Help me create an effective PubMed search query for the following research topic: "${topic}". 

Please suggest:
1. Key search terms and medical subject headings (MeSH terms)
2. Boolean operators (AND, OR, NOT) to combine terms
3. Field tags if applicable (e.g., [ti] for title, [au] for author)
4. Filters that might be useful (e.g., publication date, article type)

Format the final query as a ready-to-use PubMed search string.`
      }
    }]
  })
);

// Main function to start the server
async function main() {
  try {
    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("PubMed MCP Server is running...");
    console.error("Available tools:");
    console.error("- search_pubmed: Search PubMed and get article summaries");
    console.error("- get_full_abstract: Get complete abstracts by PMID");
    console.error("- get_full_text: Get full text from PMC by PMC ID");
    console.error("- export_ris: Export citations in RIS format for reference managers");
    console.error("- get_citation_counts: Get citation counts for specific PMIDs");
    console.error("- optimize_search_query: Transform natural language to optimized PubMed queries");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.error("\nShutting down server...");
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error("\nShutting down server...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});