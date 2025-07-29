#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchAndFetchArticles, getFullAbstract, getFullText, searchPubMed, getArticleDetails, exportRIS, getCitationCounts, optimizeSearchQuery, findSimilarArticles, batchProcess } from "./pubmed-api.js";

// Create MCP server
const server = new McpServer({
  name: "pubmed-mcp-server",
  version: "1.0.2"
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

// Tool: Find similar articles
server.registerTool(
  "find_similar_articles",
  {
    title: "Find Similar Articles",
    description: "Find articles similar to a given PubMed article using NCBI's similarity algorithm. Returns articles ranked by relevance with similarity scores.",
    inputSchema: {
      pmid: z.string().describe("PubMed ID (PMID) of the reference article"),
      maxResults: z.number().optional().default(10).describe("Maximum number of similar articles to return (default: 10, max: 50)")
    }
  },
  async ({ pmid, maxResults = 10 }) => {
    try {
      if (!pmid || pmid.trim().length === 0) {
        return {
          content: [{
            type: "text",
            text: "No PMID provided for similarity search"
          }],
          isError: true
        };
      }
      
      // Limit maxResults to prevent abuse
      const limitedMax = Math.min(maxResults, 50);
      
      // Get similar articles
      const similarArticles = await findSimilarArticles(pmid.trim(), limitedMax);
      
      if (similarArticles.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No similar articles found for PMID: ${pmid}\n\nNote: This could be due to:\n1. Invalid PMID\n2. Very recent article not yet indexed\n3. Article type not suitable for similarity matching`
          }]
        };
      }
      
      // First, get the original article details for reference
      const originalArticle = await getArticleDetails([pmid]);
      
      // Format the response
      let responseText = `🔍 **Similar Articles Analysis**\n\n`;
      
      if (originalArticle.length > 0) {
        responseText += `**Reference Article:**\n`;
        responseText += `Title: ${originalArticle[0].title}\n`;
        responseText += `Authors: ${originalArticle[0].authors.slice(0, 3).join(", ")}${originalArticle[0].authors.length > 3 ? ", et al." : ""}\n`;
        responseText += `PMID: ${pmid}\n`;
        responseText += `\n${"=".repeat(80)}\n\n`;
      }
      
      responseText += `**Found ${similarArticles.length} similar articles:**\n\n`;
      
      // Format each similar article
      const formattedResults = similarArticles.map((article, index) => {
        const authorsText = article.authors.length > 0 
          ? article.authors.slice(0, 3).join(", ") + (article.authors.length > 3 ? ", et al." : "")
          : "Unknown authors";
        
        let result = `**${index + 1}. ${article.title}**\n`;
        
        if (article.similarityScore !== undefined && article.similarityScore !== null) {
          result += `📊 Similarity Score: ${article.similarityScore.toFixed(2)}\n`;
        }
        
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
        
        result += `URL: https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/\n`;
        
        if (article.abstract) {
          const truncatedAbstract = article.abstract.length > 300 
            ? article.abstract.substring(0, 300) + "... (Use get_full_abstract for complete abstract)"
            : article.abstract;
          result += `\nAbstract: ${truncatedAbstract}\n`;
        }
        
        return result;
      }).join("\n" + "=".repeat(80) + "\n\n");
      
      responseText += formattedResults;
      
      // Extract PMIDs for easy reference
      const pmids = similarArticles.map(a => a.pmid);
      
      responseText += `\n${"=".repeat(80)}\n`;
      responseText += `**Quick Reference:**\n`;
      responseText += `PMIDs of similar articles: ${pmids.join(", ")}\n`;
      responseText += `\n💡 **Tips:**\n`;
      responseText += `• Use get_full_abstract with PMIDs for complete abstracts\n`;
      responseText += `• Use search_pubmed to explore specific topics from these articles\n`;
      responseText += `• Higher similarity scores indicate stronger relevance\n`;
      
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
          text: `Error finding similar articles: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Batch Processing
server.registerTool(
  "batch_process",
  {
    title: "Batch Process",
    description: "Process multiple PMIDs with multiple operations efficiently. Supports abstracts, citations, similar articles, RIS export, and full text.",
    inputSchema: {
      pmids: z.union([
        z.array(z.string()),
        z.string()
      ]).describe("Array of PubMed IDs (PMIDs) to process, or space/comma-separated string (e.g., ['123', '456'] or '123 456 789' or '123,456,789')"),
      operations: z.array(z.enum(["abstract", "citations", "similar", "ris_export", "full_text"])).describe("Operations to perform on each PMID"),
      maxConcurrency: z.number().optional().default(3).describe("Maximum concurrent operations (default: 3)")
    }
  },
  async ({ pmids, operations, maxConcurrency = 3 }) => {
    try {
      // Parse PMIDs from different input formats
      let pmidArray: string[] = [];
      
      if (typeof pmids === 'string') {
        // Handle space or comma-separated string
        pmidArray = pmids
          .split(/[\s,]+/)  // Split by spaces or commas
          .map(pmid => pmid.trim())
          .filter(pmid => pmid.length > 0);
      } else if (Array.isArray(pmids)) {
        pmidArray = pmids.filter(pmid => pmid && pmid.trim().length > 0);
      }
      
      if (pmidArray.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No valid PMIDs provided for batch processing"
          }],
          isError: true
        };
      }
      
      if (!operations || operations.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No operations specified for batch processing"
          }],
          isError: true
        };
      }
      
      // Limit to prevent abuse
      const limitedPmids = pmidArray.slice(0, 50);  // Max 50 PMIDs
      const limitedConcurrency = Math.min(maxConcurrency, 5);  // Max 5 concurrent
      
      if (pmidArray.length > 50) {
        console.warn(`Requested ${pmidArray.length} PMIDs, limiting to 50 for batch processing`);
      }
      
      // Start batch processing
      const result = await batchProcess(limitedPmids, operations, limitedConcurrency);
      
      // Format the response
      let responseText = `📦 **Batch Processing Results**\n\n`;
      responseText += `**Task ID**: ${result.taskId}\n`;
      responseText += `**PMIDs processed**: ${limitedPmids.length}\n`;
      responseText += `**Operations**: ${operations.join(", ")}\n\n`;
      
      // Summary
      responseText += `📊 **Summary**:\n`;
      responseText += `• Total operations: ${result.summary.total}\n`;
      responseText += `• Completed: ${result.summary.completed}\n`;
      responseText += `• Failed: ${result.summary.failed}\n`;
      responseText += `• Success rate: ${((result.summary.completed / result.summary.total) * 100).toFixed(1)}%\n\n`;
      
      responseText += `${"=".repeat(80)}\n\n`;
      
      // Results by operation type
      if (result.results.abstracts && result.results.abstracts.length > 0) {
        responseText += `📄 **Abstracts Retrieved**: ${result.results.abstracts.length}\n`;
        result.results.abstracts.slice(0, 3).forEach((abstract, index) => {
          responseText += `${index + 1}. ${abstract.title} (PMID: ${abstract.pmid})\n`;
        });
        if (result.results.abstracts.length > 3) {
          responseText += `... and ${result.results.abstracts.length - 3} more abstracts\n`;
        }
        responseText += `\n`;
      }
      
      if (result.results.citations && result.results.citations.length > 0) {
        responseText += `📊 **Citation Analysis**: ${result.results.citations.length} articles\n`;
        const totalCitations = result.results.citations.reduce((sum, c) => sum + c.citationCount, 0);
        responseText += `Total citations found: ${totalCitations}\n`;
        const topCited = result.results.citations
          .sort((a, b) => b.citationCount - a.citationCount)
          .slice(0, 3);
        topCited.forEach((citation, index) => {
          responseText += `${index + 1}. ${citation.title}: ${citation.citationCount} citations\n`;
        });
        responseText += `\n`;
      }
      
      if (result.results.similar && Object.keys(result.results.similar).length > 0) {
        responseText += `🔍 **Similar Articles**: Found for ${Object.keys(result.results.similar).length} PMIDs\n`;
        Object.entries(result.results.similar).slice(0, 2).forEach(([pmid, similars]) => {
          responseText += `PMID ${pmid}: ${similars.length} similar articles\n`;
        });
        responseText += `\n`;
      }
      
      if (result.results.risExports) {
        responseText += `📋 **RIS Export**: Generated for all processed PMIDs\n`;
        responseText += `RIS data length: ${result.results.risExports.length} characters\n\n`;
      }
      
      if (result.results.fullTexts && result.results.fullTexts.length > 0) {
        responseText += `📖 **Full Texts Retrieved**: ${result.results.fullTexts.length}\n`;
        result.results.fullTexts.forEach((fullText, index) => {
          responseText += `${index + 1}. ${fullText.title} (PMC: ${fullText.pmcId})\n`;
        });
        responseText += `\n`;
      }
      
      // Error details if any
      if (result.summary.failed > 0) {
        responseText += `⚠️ **Failed Operations**:\n`;
        const failedOps = result.operations.filter(op => op.status === 'error');
        failedOps.slice(0, 5).forEach((op, index) => {
          responseText += `${index + 1}. PMID ${op.pmid} (${op.operation}): ${op.error}\n`;
        });
        if (failedOps.length > 5) {
          responseText += `... and ${failedOps.length - 5} more errors\n`;
        }
        responseText += `\n`;
      }
      
      responseText += `${"=".repeat(80)}\n`;
      responseText += `**💡 Tips:**\n`;
      responseText += `• Use individual tools for detailed analysis of specific results\n`;
      responseText += `• Check failed operations and retry with valid PMIDs\n`;
      responseText += `• For large datasets, consider processing in smaller batches\n`;
      
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
          text: `Error in batch processing: ${errorMessage}`
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
    
    console.error("PubMed MCP Server v1.0.2 is running...");
    console.error("Available tools:");
    console.error("- search_pubmed: Search PubMed and get article summaries");
    console.error("- get_full_abstract: Get complete abstracts by PMID");
    console.error("- get_full_text: Get full text from PMC by PMC ID");
    console.error("- export_ris: Export citations in RIS format for reference managers");
    console.error("- get_citation_counts: Get citation counts for specific PMIDs");
    console.error("- optimize_search_query: Transform natural language to optimized PubMed queries");
    console.error("- find_similar_articles: Find similar articles using NCBI's similarity algorithm");
    console.error("- batch_process: Process multiple PMIDs with multiple operations efficiently (NEW)");
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