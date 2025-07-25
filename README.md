# PubMed MCP Server v2

A comprehensive Model Context Protocol (MCP) server that provides advanced access to the PubMed database for biomedical literature search, retrieval, and analysis. This server transforms natural language queries into optimized PubMed searches using MeSH terms and provides citation analysis capabilities.

## 🚀 Features

### 🔧 Tools

- **`search_pubmed`**: Search PubMed database with comprehensive article summaries, abstracts, and metadata
- **`get_full_abstract`**: Retrieve complete, untruncated abstracts for specific articles by PMID
- **`get_full_text`**: Extract full text content from PubMed Central (PMC) open access articles
- **`export_ris`**: Export citations in RIS format for reference management software (Zotero, Mendeley, EndNote)
- **`get_citation_counts`**: Analyze citation metrics and find citing articles using NCBI elink API
- **`optimize_search_query`** ✨: Transform natural language queries into optimized PubMed searches with MeSH terms and field tags

### 📚 Resources

- **`pubmed://search/{query}`**: Access search results as structured JSON resource

### 💡 Prompts

- **`generate_search_query`**: Interactive assistant for creating effective PubMed search strategies

## 📋 Prerequisites

- Node.js v18.x or higher
- npm or yarn package manager

## 🛠️ Installation

1. Clone this repository:
```bash
git clone https://github.com/YOUR_USERNAME/pubmed_mcp_server2.git
cd pubmed_mcp_server2
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

## 🎯 Usage

### Running the Server

```bash
npm start
```

### Claude Desktop Integration

Add to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pubmed-server": {
      "command": "node",
      "args": ["C:\\path\\to\\pubmed_mcp_server2\\dist\\index.js"],
      "env": {}
    }
  }
}
```

Replace the path with your actual installation directory.

### Example Usage

#### 1. Query Optimization
```
Input: "covid vaccine effectiveness in elderly"
→ Transforms to: ("COVID-19"[MeSH Terms] OR "SARS-CoV-2"[MeSH Terms]) AND ("Vaccination"[MeSH Terms]) AND ("Treatment Outcome"[MeSH Terms]) AND ("Aged"[MeSH Terms])
```

#### 2. Basic Literature Search
```
search_pubmed: "diabetes treatment 2023"
→ Returns: Detailed articles with abstracts, PMIDs, DOIs, and citation metrics
```

#### 3. Citation Analysis
```
get_citation_counts: "36038128, 30105375"
→ Returns: Citation counts and lists of citing articles for each PMID
```

#### 4. Reference Management
```
export_ris: "36038128, 30105375"
→ Returns: RIS formatted citations ready for import into reference managers
```

## 🧠 MeSH Term Optimization

The server includes an extensive database of medical term mappings covering:

- **COVID-19 & Vaccines**: covid, coronavirus, vaccination, immunization
- **Cardiovascular**: heart attack, myocardial infarction, cardiovascular disease
- **Cancer**: cancer, tumor, oncology, carcinoma
- **Mental Health**: depression, anxiety, psychiatric disorders
- **Age Groups**: elderly, children, pediatric, adolescent
- **Study Types**: clinical trial, meta-analysis, systematic review, RCT
- **Treatment Types**: therapy, surgery, medication, drug treatment

## 🔧 Advanced Search Features

### Field Tags Supported
- `[ti]` - Title
- `[ab]` - Abstract
- `[au]` - Author
- `[ta]` - Journal Title
- `[MeSH Terms]` - Medical Subject Headings
- `[tw]` - Text Word
- `[pt]` - Publication Type
- `[pdat]` - Publication Date

### Boolean Operators
- `AND` - All terms must be present
- `OR` - Any of the terms can be present
- `NOT` - Exclude specific terms
- Parentheses for grouping complex queries

## 📊 API Endpoints & Rate Limiting

### NCBI E-utilities APIs Used
- **ESearch**: Search and retrieve primary IDs
- **EFetch**: Retrieve full records and abstracts
- **ESummary**: Retrieve document summaries
- **ELink**: Find related articles and citations
- **Literature Citation Exporter**: RIS format export

### Rate Limiting & Limits
- **Search results**: Maximum 100 articles per query
- **Citation analysis**: Maximum 20 PMIDs per request
- **RIS export**: Maximum 50 PMIDs per batch
- **Full text**: Maximum 10 PMC articles per request
- **API delays**: 200-400ms between requests to respect NCBI guidelines

## ⚙️ Configuration

### Customizable Parameters

Edit `src/pubmed-api.ts` to modify:

```typescript
// Email for NCBI API (required by NCBI guidelines)
email: 'your-email@example.com'

// Rate limiting delays
const delayBetweenRequests = 200; // milliseconds

// Result limits
const maxResults = 100; // search results
const maxPmids = 20;    // citation analysis
```

## 🔍 Error Handling

Comprehensive error handling for:
- Network connectivity issues
- Invalid PMIDs or queries
- API rate limiting and timeouts
- XML/JSON parsing errors
- Missing full text content
- Citation data unavailability

## 🚧 Development

### Available Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Build and run in development
npm run clean      # Remove compiled files
npm run start      # Start the compiled server
```

### Project Structure

```
pubmed_mcp_server2/
├── src/
│   ├── index.ts           # Main MCP server setup and tool registration
│   └── pubmed-api.ts      # PubMed API integration and utilities
├── dist/                  # Compiled JavaScript output
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

### Adding New Features

1. **New MeSH mappings**: Add to `MESH_MAPPINGS` object in `pubmed-api.ts`
2. **New tools**: Register in `index.ts` using `server.registerTool()`
3. **Field tags**: Add to `FIELD_TAGS` object for query optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit with descriptive messages: `git commit -m "Add feature description"`
5. Push to your branch: `git push origin feature-name`
6. Submit a pull request

## 📖 Documentation

### PubMed Search Tips

1. **Use MeSH terms** for standardized medical vocabulary
2. **Combine multiple concepts** with AND/OR operators
3. **Use field tags** to target specific parts of articles
4. **Add date ranges** to focus on recent research
5. **Filter by publication type** for specific study designs

### Reference Management Integration

The RIS export feature supports:
- **Zotero**: File → Import
- **Mendeley**: File → Import → RIS
- **EndNote**: File → Import → File
- **Papers**: Import → From File
- **RefWorks**: Import → References

## 🛡️ Privacy & Ethics

- No user data is stored or logged
- All queries are sent directly to NCBI APIs
- Complies with NCBI usage guidelines
- Respects API rate limits and terms of service

## 📄 License

MIT License - see LICENSE file for details

## 🙋‍♂️ Support

For issues, questions, or contributions:
1. Check existing issues on GitHub
2. Create a new issue with detailed description
3. Include error messages and steps to reproduce

## 🔗 Related Resources

- [NCBI E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25497/)
- [PubMed Search Tips](https://pubmed.ncbi.nlm.nih.gov/help/)
- [MeSH Database](https://www.ncbi.nlm.nih.gov/mesh/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Desktop](https://claude.ai/download)