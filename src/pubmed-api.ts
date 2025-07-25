import { parseString } from 'xml2js';

// PubMed E-utilities API base URLs
const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const ELINK_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi';

// Note: Now using E-utilities efetch for PMC full text instead of BioC API

// Literature Citation Exporter API
const LIT_CITATION_URL = 'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1';

// Types for PubMed API responses
export interface PubMedSearchResult {
  idList: string[];
  count: number;
  retMax: number;
  retStart: number;
  queryTranslation?: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  abstract?: string;
  doi?: string;
  pmcId?: string;
  url: string;
}

export interface PubMedSummary {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  doi?: string;
  pmcId?: string;
}

export interface FullAbstractResult {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  fullAbstract: string;
  doi?: string;
  pmcId?: string;
}

export interface FullTextResult {
  pmid: string;
  pmcId: string;
  title: string;
  fullText: string;
  sections: {
    title: string;
    content: string;
  }[];
}

export interface RISExportResult {
  pmids: string[];
  risData: string;
  successCount: number;
  errorCount: number;
  errors: string[];
}

export interface CitationCountResult {
  pmid: string;
  title: string;
  citationCount: number;
  citingPmids: string[];
  error?: string;
}

export interface QueryOptimizationResult {
  originalQuery: string;
  optimizedQuery: string;
  improvements: string[];
  meshTermsUsed: string[];
  fieldTagsUsed: string[];
  estimatedResults?: number;
}

// XML parser utility
function parseXML(xml: string): Promise<any> {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Build query URL with parameters
function buildUrl(baseUrl: string, params: Record<string, string | number>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value.toString());
  });
  return url.toString();
}

// Search PubMed articles
export async function searchPubMed(
  query: string,
  maxResults: number = 20,
  startIndex: number = 0
): Promise<PubMedSearchResult> {
  const params = {
    db: 'pubmed',
    term: query,
    retmax: maxResults,
    retstart: startIndex,
    retmode: 'xml',
    tool: 'mcp-pubmed-server',
    email: 'user@example.com' // Replace with actual email
  };

  try {
    const url = buildUrl(ESEARCH_URL, params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlData = await response.text();
    const parsed = await parseXML(xmlData);
    
    const eSearchResult = parsed.eSearchResult;
    const idList = eSearchResult.IdList?.Id || [];
    
    return {
      idList: Array.isArray(idList) ? idList : [idList].filter(Boolean),
      count: parseInt(eSearchResult.Count || '0'),
      retMax: parseInt(eSearchResult.RetMax || '0'),
      retStart: parseInt(eSearchResult.RetStart || '0'),
      queryTranslation: eSearchResult.QueryTranslation
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`PubMed search failed: ${errorMessage}`);
  }
}

// Get article summaries by PMIDs
export async function getArticleSummaries(pmids: string[]): Promise<PubMedSummary[]> {
  if (pmids.length === 0) return [];

  const params = {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    tool: 'mcp-pubmed-server',
    email: 'user@example.com'
  };

  try {
    const url = buildUrl(ESUMMARY_URL, params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlData = await response.text();
    const parsed = await parseXML(xmlData);
    
    const docSums = parsed.eSummaryResult?.DocSum || [];
    const summaries = Array.isArray(docSums) ? docSums : [docSums];
    
    return summaries.map((docSum: any) => {
      const items = Array.isArray(docSum.Item) ? docSum.Item : [docSum.Item];
      const itemMap: Record<string, any> = {};
      
      items.forEach((item: any) => {
        if (item && item.$.Name) {
          itemMap[item.$.Name] = item._;
        }
      });
      
      // Parse authors
      const authorList = itemMap.AuthorList || '';
      const authors = authorList.split(',').map((author: string) => author.trim()).filter(Boolean);
      
      return {
        pmid: docSum.Id,
        title: itemMap.Title || 'No title available',
        authors: authors,
        journal: itemMap.Source || 'Unknown journal',
        publicationDate: itemMap.PubDate || 'Unknown date',
        doi: itemMap.DOI,
        pmcId: itemMap.PMCID
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get article summaries: ${errorMessage}`);
  }
}

// Get full article details by PMIDs
export async function getArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const params = {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
    tool: 'mcp-pubmed-server',
    email: 'user@example.com'
  };

  try {
    const url = buildUrl(EFETCH_URL, params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlData = await response.text();
    const parsed = await parseXML(xmlData);
    
    const pubmedArticles = parsed.PubmedArticleSet?.PubmedArticle || [];
    const articles = Array.isArray(pubmedArticles) ? pubmedArticles : [pubmedArticles];
    
    return articles.map((article: any) => {
      const medlineCitation = article.MedlineCitation;
      const pmid = medlineCitation.PMID._ || medlineCitation.PMID;
      const articleData = medlineCitation.Article;
      
      // Extract title
      const title = articleData.ArticleTitle || 'No title available';
      
      // Extract authors
      const authorList = articleData.AuthorList?.Author || [];
      const authors = (Array.isArray(authorList) ? authorList : [authorList])
        .map((author: any) => {
          if (author.ForeName && author.LastName) {
            return `${author.ForeName} ${author.LastName}`;
          } else if (author.CollectiveName) {
            return author.CollectiveName;
          }
          return 'Unknown Author';
        })
        .filter(Boolean);
      
      // Extract journal info
      const journal = articleData.Journal?.Title || 'Unknown journal';
      
      // Extract publication date
      const pubDate = articleData.Journal?.JournalIssue?.PubDate;
      let publicationDate = 'Unknown date';
      if (pubDate) {
        const year = pubDate.Year || '';
        const month = pubDate.Month || '';
        const day = pubDate.Day || '';
        publicationDate = [year, month, day].filter(Boolean).join(' ');
      }
      
      // Extract abstract
      const abstractTexts = articleData.Abstract?.AbstractText || [];
      let abstract = '';
      if (Array.isArray(abstractTexts)) {
        abstract = abstractTexts.map((text: any) => {
          if (typeof text === 'string') return text;
          if (text._ && text.$.Label) return `${text.$.Label}: ${text._}`;
          return text._ || text;
        }).join('\n\n');
      } else if (typeof abstractTexts === 'string') {
        abstract = abstractTexts;
      } else if (abstractTexts._) {
        abstract = abstractTexts._;
      }
      
      // Extract DOI and PMC ID
      const articleIds = article.PubmedData?.ArticleIdList?.ArticleId || [];
      const ids = Array.isArray(articleIds) ? articleIds : [articleIds];
      let doi = '';
      let pmcId = '';
      
      ids.forEach((id: any) => {
        if (id.$.IdType === 'doi') {
          doi = id._;
        } else if (id.$.IdType === 'pmc') {
          pmcId = id._;
        }
      });
      
      return {
        pmid,
        title,
        authors,
        journal,
        publicationDate,
        abstract,
        doi,
        pmcId,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get article details: ${errorMessage}`);
  }
}

// Get full abstract for specific PMIDs
export async function getFullAbstract(pmids: string[]): Promise<FullAbstractResult[]> {
  if (pmids.length === 0) return [];

  const params = {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
    tool: 'mcp-pubmed-server',
    email: 'user@example.com'
  };

  try {
    const url = buildUrl(EFETCH_URL, params);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlData = await response.text();
    const parsed = await parseXML(xmlData);
    
    const pubmedArticles = parsed.PubmedArticleSet?.PubmedArticle || [];
    const articles = Array.isArray(pubmedArticles) ? pubmedArticles : [pubmedArticles];
    
    return articles.map((article: any) => {
      const medlineCitation = article.MedlineCitation;
      const pmid = medlineCitation.PMID._ || medlineCitation.PMID;
      const articleData = medlineCitation.Article;
      
      // Extract title
      const title = articleData.ArticleTitle || 'No title available';
      
      // Extract authors
      const authorList = articleData.AuthorList?.Author || [];
      const authors = (Array.isArray(authorList) ? authorList : [authorList])
        .map((author: any) => {
          if (author.ForeName && author.LastName) {
            return `${author.ForeName} ${author.LastName}`;
          } else if (author.CollectiveName) {
            return author.CollectiveName;
          }
          return 'Unknown Author';
        })
        .filter(Boolean);
      
      // Extract journal info
      const journal = articleData.Journal?.Title || 'Unknown journal';
      
      // Extract publication date
      const pubDate = articleData.Journal?.JournalIssue?.PubDate;
      let publicationDate = 'Unknown date';
      if (pubDate) {
        const year = pubDate.Year || '';
        const month = pubDate.Month || '';
        const day = pubDate.Day || '';
        publicationDate = [year, month, day].filter(Boolean).join(' ');
      }
      
      // Extract FULL abstract (without truncation)
      const abstractTexts = articleData.Abstract?.AbstractText || [];
      let fullAbstract = '';
      if (Array.isArray(abstractTexts)) {
        fullAbstract = abstractTexts.map((text: any) => {
          if (typeof text === 'string') return text;
          if (text._ && text.$.Label) return `${text.$.Label}: ${text._}`;
          return text._ || text;
        }).join('\n\n');
      } else if (typeof abstractTexts === 'string') {
        fullAbstract = abstractTexts;
      } else if (abstractTexts._) {
        fullAbstract = abstractTexts._;
      }
      
      // Extract DOI and PMC ID
      const articleIds = article.PubmedData?.ArticleIdList?.ArticleId || [];
      const ids = Array.isArray(articleIds) ? articleIds : [articleIds];
      let doi = '';
      let pmcId = '';
      
      ids.forEach((id: any) => {
        if (id.$.IdType === 'doi') {
          doi = id._;
        } else if (id.$.IdType === 'pmc') {
          pmcId = id._;
        }
      });
      
      return {
        pmid,
        title,
        authors,
        journal,
        publicationDate,
        fullAbstract,
        doi,
        pmcId
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get full abstracts: ${errorMessage}`);
  }
}

// Get full text from PMC for articles with PMC ID using E-utilities
export async function getFullText(pmcIds: string[]): Promise<FullTextResult[]> {
  if (pmcIds.length === 0) return [];

  const results: FullTextResult[] = [];

  // Process each PMC ID individually
  for (const pmcId of pmcIds) {
    try {
      // Clean PMC ID (remove PMC prefix if present)
      const cleanPmcId = pmcId.replace(/^PMC/, '');
      
      // Use E-utilities efetch API for PMC database
      const params = {
        db: 'pmc',
        id: cleanPmcId,
        retmode: 'xml',
        tool: 'mcp-pubmed-server',
        email: 'user@example.com'
      };
      
      const url = buildUrl(EFETCH_URL, params);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to fetch full text for PMC${cleanPmcId}: ${response.status}`);
        continue;
      }
      
      const xmlData = await response.text();
      
      // Check if we got an error response
      if (xmlData.includes('Error occurred') || xmlData.includes('esearchresult')) {
        console.warn(`No full text available for PMC${cleanPmcId}`);
        continue;
      }
      
      const parsed = await parseXML(xmlData);
      
      // Parse NLM XML format
      const articleSet = parsed['pmc-articleset'];
      if (!articleSet || !articleSet.article) {
        console.warn(`No article found in PMC${cleanPmcId}`);
        continue;
      }
      
      const article = Array.isArray(articleSet.article) ? articleSet.article[0] : articleSet.article;
      const front = article.front;
      const body = article.body;
      
      // Extract basic metadata
      const articleMeta = front?.[0]?.['article-meta']?.[0] || front?.['article-meta'];
      
      // Extract title
      let title = 'Unknown title';
      const titleGroup = articleMeta?.['title-group'];
      if (titleGroup) {
        const articleTitle = Array.isArray(titleGroup) ? titleGroup[0]?.['article-title'] : titleGroup['article-title'];
        if (articleTitle) {
          title = Array.isArray(articleTitle) ? articleTitle[0] : articleTitle;
          // Clean up XML content in title
          if (typeof title === 'object' && (title as any)._) {
            title = (title as any)._;
          }
        }
      }
      
      // Extract PMID
      let pmid = '';
      const articleIds = articleMeta?.['article-id'];
      if (articleIds) {
        const ids = Array.isArray(articleIds) ? articleIds : [articleIds];
        const pmidEntry = ids.find((id: any) => id.$?.['pub-id-type'] === 'pmid');
        if (pmidEntry) {
          pmid = pmidEntry._ || pmidEntry;
        }
      }
      
      // Extract sections from body
      const sections: { title: string; content: string }[] = [];
      let fullText = '';
      
      if (body) {
        const bodyContent = Array.isArray(body) ? body[0] : body;
        
        // Function to extract text from any element recursively
        function extractText(element: any): string {
          if (typeof element === 'string') {
            return element;
          }
          
          if (typeof element === 'object') {
            if (element._) {
              return element._;
            }
            
            let text = '';
            Object.values(element).forEach((value: any) => {
              if (Array.isArray(value)) {
                value.forEach((item: any) => {
                  text += extractText(item) + ' ';
                });
              } else {
                text += extractText(value) + ' ';
              }
            });
            return text.trim();
          }
          
          return '';
        }
        
        // Function to process sections
        function processSections(element: any, sectionTitle = 'Content') {
          if (element.sec) {
            const secs = Array.isArray(element.sec) ? element.sec : [element.sec];
            
            secs.forEach((section: any) => {
              // Extract section title
              let secTitle = sectionTitle;
              if (section.title) {
                const titleText = extractText(section.title);
                if (titleText.trim()) {
                  secTitle = titleText.trim();
                }
              }
              
              // Extract section content
              let secContent = '';
              
              // Get paragraphs
              if (section.p) {
                const paragraphs = Array.isArray(section.p) ? section.p : [section.p];
                paragraphs.forEach((para: any) => {
                  const paraText = extractText(para);
                  if (paraText.trim()) {
                    secContent += paraText.trim() + '\n\n';
                  }
                });
              }
              
              // Process nested sections
              if (section.sec) {
                processSections(section, secTitle);
              } else if (secContent.trim()) {
                sections.push({
                  title: secTitle,
                  content: secContent.trim()
                });
                fullText += `${secTitle}\n${secContent}\n`;
              }
            });
          }
          
          // Also check for direct paragraphs
          if (element.p) {
            const paragraphs = Array.isArray(element.p) ? element.p : [element.p];
            let content = '';
            paragraphs.forEach((para: any) => {
              const paraText = extractText(para);
              if (paraText.trim()) {
                content += paraText.trim() + '\n\n';
              }
            });
            
            if (content.trim()) {
              sections.push({
                title: sectionTitle,
                content: content.trim()
              });
              fullText += `${sectionTitle}\n${content}\n`;
            }
          }
        }
        
        // Process the body content
        processSections(bodyContent);
      }
      
      // If no sections were found, try to extract any available text
      if (sections.length === 0 && fullText.trim() === '') {
        // Fallback extraction function for the entire article
        function fallbackExtractText(element: any): string {
          if (typeof element === 'string') {
            return element;
          }
          
          if (typeof element === 'object') {
            if (element._) {
              return element._;
            }
            
            let text = '';
            Object.values(element).forEach((value: any) => {
              if (Array.isArray(value)) {
                value.forEach((item: any) => {
                  text += fallbackExtractText(item) + ' ';
                });
              } else if (typeof value === 'object' || typeof value === 'string') {
                text += fallbackExtractText(value) + ' ';
              }
            });
            return text.trim();
          }
          
          return '';
        }
        
        const allText = fallbackExtractText(article);
        if (allText.trim()) {
          fullText = allText.trim();
          sections.push({
            title: 'Full Article Content',
            content: fullText
          });
        }
      }
      
      if (fullText.trim() || sections.length > 0) {
        results.push({
          pmid,
          pmcId: `PMC${cleanPmcId}`,
          title,
          fullText: fullText.trim(),
          sections
        });
      } else {
        console.warn(`No extractable content found for PMC${cleanPmcId}`);
      }
      
    } catch (error) {
      console.warn(`Error processing PMC${pmcId}: ${error}`);
      continue;
    }
  }

  return results;
}

// Export citations in RIS format using Literature Citation Exporter API
export async function exportRIS(pmids: string[]): Promise<RISExportResult> {
  if (pmids.length === 0) {
    return {
      pmids: [],
      risData: '',
      successCount: 0,
      errorCount: 0,
      errors: []
    };
  }

  const errors: string[] = [];
  let allRISData = '';
  let successCount = 0;
  
  // Process in batches to respect rate limits (3 requests/second)
  const batchSize = 10; // Process 10 PMIDs at a time
  const delayBetweenRequests = 400; // 400ms delay to stay under 3 req/sec

  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    
    try {
      // Construct URL for Literature Citation Exporter API
      const url = `${LIT_CITATION_URL}/pubmed/?format=ris&id=${batch.join(',')}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const risData = await response.text();
      
      // Check if we got valid RIS data
      if (risData.trim() && !risData.includes('Error') && !risData.includes('error')) {
        allRISData += risData;
        if (!risData.endsWith('\n')) {
          allRISData += '\n';
        }
        
        // Count successful entries by counting 'TY  -' lines
        const tyCount = (risData.match(/^TY  -/gm) || []).length;
        successCount += tyCount;
      } else {
        errors.push(`No valid RIS data for PMIDs: ${batch.join(', ')}`);
      }
      
      // Rate limiting: wait between requests to respect 3 requests/second limit
      if (i + batchSize < pmids.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to fetch RIS for PMIDs ${batch.join(', ')}: ${errorMessage}`);
    }
  }

  return {
    pmids,
    risData: allRISData,
    successCount,
    errorCount: pmids.length - successCount,
    errors
  };
}

// Combined search and fetch function
export async function searchAndFetchArticles(
  query: string,
  maxResults: number = 10
): Promise<PubMedArticle[]> {
  try {
    // First, search for article IDs
    const searchResult = await searchPubMed(query, maxResults);
    
    if (searchResult.idList.length === 0) {
      return [];
    }
    
    // Then fetch full details for the articles
    const articles = await getArticleDetails(searchResult.idList);
    
    return articles;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Search and fetch failed: ${errorMessage}`);
  }
}

// Get citation count for specific PMIDs using elink
export async function getCitationCounts(pmids: string[]): Promise<CitationCountResult[]> {
  if (pmids.length === 0) return [];
  
  const results: CitationCountResult[] = [];
  
  // Process each PMID individually to get accurate citation data
  for (const pmid of pmids) {
    try {
      // First get article title for display
      const articleDetails = await getArticleDetails([pmid]);
      const title = articleDetails.length > 0 ? articleDetails[0].title : 'Unknown title';
      
      // Use elink to find articles that cite this PMID
      const params = {
        dbfrom: 'pubmed',
        db: 'pubmed',
        id: pmid,
        linkname: 'pubmed_pubmed_citedin',
        retmode: 'xml',
        tool: 'mcp-pubmed-server',
        email: 'user@example.com'
      };
      
      const url = buildUrl(ELINK_URL, params);
      const response = await fetch(url);
      
      if (!response.ok) {
        results.push({
          pmid,
          title,
          citationCount: 0,
          citingPmids: [],
          error: `HTTP error! status: ${response.status}`
        });
        continue;
      }
      
      const xmlData = await response.text();
      const parsed = await parseXML(xmlData);
      
      // Parse elink response
      const linkSets = parsed.eLinkResult?.LinkSet || [];
      const linkSetArray = Array.isArray(linkSets) ? linkSets : [linkSets];
      
      let citingPmids: string[] = [];
      
      // Find the linkset with pubmed_pubmed_citedin
      for (const linkSet of linkSetArray) {
        if (linkSet.LinkSetDb) {
          const linkSetDbs = Array.isArray(linkSet.LinkSetDb) ? linkSet.LinkSetDb : [linkSet.LinkSetDb];
          
          for (const linkSetDb of linkSetDbs) {
            if (linkSetDb.LinkName === 'pubmed_pubmed_citedin') {
              const links = linkSetDb.Link || [];
              const linkArray = Array.isArray(links) ? links : [links];
              
              citingPmids = linkArray.map((link: any) => link.Id).filter(Boolean);
              break;
            }
          }
        }
      }
      
      results.push({
        pmid,
        title,
        citationCount: citingPmids.length,
        citingPmids: citingPmids.slice(0, 100) // Limit to first 100 citing PMIDs for performance
      });
      
      // Rate limiting to be respectful to NCBI servers
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      results.push({
        pmid,
        title: 'Unknown title',
        citationCount: 0,
        citingPmids: [],
        error: `Failed to get citation count: ${errorMessage}`
      });
    }
  }
  
  return results;
}

// Common medical term mappings to MeSH terms
const MESH_MAPPINGS: Record<string, string[]> = {
  // COVID-19 related
  'covid': ['COVID-19', 'SARS-CoV-2'],
  'covid-19': ['COVID-19', 'SARS-CoV-2'],
  'coronavirus': ['COVID-19', 'SARS-CoV-2', 'Coronavirus'],
  'sars-cov-2': ['SARS-CoV-2'],
  
  // Vaccination related
  'vaccine': ['Vaccination', 'Vaccines', 'Immunization'],
  'vaccination': ['Vaccination', 'Immunization'],
  'immunization': ['Immunization', 'Vaccination'],
  'immunisation': ['Immunization', 'Vaccination'],
  
  // Heart disease
  'heart attack': ['Myocardial Infarction'],
  'myocardial infarction': ['Myocardial Infarction'],
  'heart disease': ['Heart Disease', 'Cardiovascular Diseases'],
  'cardiac': ['Heart', 'Cardiovascular System'],
  'cardiovascular': ['Cardiovascular Diseases'],
  
  // Cancer
  'cancer': ['Neoplasms'],
  'tumor': ['Neoplasms'],
  'tumour': ['Neoplasms'],
  'carcinoma': ['Carcinoma'],
  'oncology': ['Medical Oncology', 'Neoplasms'],
  
  // Diabetes
  'diabetes': ['Diabetes Mellitus'],
  'diabetic': ['Diabetes Mellitus'],
  'insulin': ['Insulin'],
  'blood sugar': ['Blood Glucose'],
  'glucose': ['Glucose', 'Blood Glucose'],
  
  // Mental health
  'depression': ['Depression', 'Depressive Disorder'],
  'anxiety': ['Anxiety', 'Anxiety Disorders'],
  'mental health': ['Mental Health'],
  'psychiatric': ['Mental Disorders', 'Psychiatry'],
  'psychology': ['Psychology'],
  
  // Age groups
  'elderly': ['Aged', 'Aged, 80 and over'],
  'older adults': ['Aged'],
  'seniors': ['Aged'],
  'children': ['Child'],
  'pediatric': ['Child', 'Pediatrics'],
  'paediatric': ['Child', 'Pediatrics'],
  'infant': ['Infant'],
  'adolescent': ['Adolescent'],
  
  // Treatment types
  'treatment': ['Therapeutics', 'Therapy'],
  'therapy': ['Therapy'],
  'drug': ['Pharmaceutical Preparations', 'Drug Therapy'],
  'medication': ['Pharmaceutical Preparations'],
  'surgery': ['Surgical Procedures, Operative'],
  'operation': ['Surgical Procedures, Operative'],
  
  // Study types
  'clinical trial': ['Clinical Trials as Topic', 'Randomized Controlled Trials as Topic'],
  'randomized': ['Randomized Controlled Trials as Topic'],
  'rct': ['Randomized Controlled Trials as Topic'],
  'meta-analysis': ['Meta-Analysis as Topic'],
  'systematic review': ['Systematic Reviews as Topic'],
  'cohort': ['Cohort Studies'],
  'case-control': ['Case-Control Studies'],
  
  // Common symptoms
  'pain': ['Pain'],
  'fever': ['Fever'],
  'cough': ['Cough'],
  'fatigue': ['Fatigue'],
  'headache': ['Headache'],
  
  // Effectiveness terms
  'effectiveness': ['Treatment Outcome', 'Efficacy'],
  'efficacy': ['Treatment Outcome'],
  'outcome': ['Treatment Outcome'],
  'results': ['Treatment Outcome']
};

// Field tag mappings
const FIELD_TAGS: Record<string, string> = {
  'title': '[ti]',
  'abstract': '[ab]',
  'author': '[au]',
  'journal': '[ta]',
  'text word': '[tw]',
  'mesh': '[MeSH Terms]',
  'major': '[MeSH Major Topic]',
  'publication type': '[pt]',
  'language': '[la]',
  'publication date': '[pdat]'
};

// Optimize search query by adding MeSH terms and proper formatting
export async function optimizeSearchQuery(originalQuery: string): Promise<QueryOptimizationResult> {
  const improvements: string[] = [];
  const meshTermsUsed: string[] = [];
  const fieldTagsUsed: string[] = [];
  
  // Convert to lowercase for processing
  const lowerQuery = originalQuery.toLowerCase();
  
  // Split query into words and phrases
  const words = lowerQuery.split(/\s+/);
  const queryParts: string[] = [];
  
  // Track which terms we've processed to avoid duplicates
  const processedTerms = new Set<string>();
  
  // Process each word and find MeSH mappings
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w\s-]/g, ''); // Remove punctuation except hyphens
    
    // Check for exact matches first
    if (MESH_MAPPINGS[word] && !processedTerms.has(word)) {
      const meshTerms = MESH_MAPPINGS[word];
      const meshQuery = meshTerms.map(term => `"${term}"[MeSH Terms]`).join(' OR ');
      
      if (meshTerms.length > 1) {
        queryParts.push(`(${meshQuery})`);
      } else {
        queryParts.push(meshQuery);
      }
      
      meshTermsUsed.push(...meshTerms);
      fieldTagsUsed.push('[MeSH Terms]');
      processedTerms.add(word);
      improvements.push(`Added MeSH terms for "${word}": ${meshTerms.join(', ')}`);
    }
    // Check for multi-word phrases
    else if (i < words.length - 1) {
      const twoWordPhrase = `${word} ${words[i + 1]}`;
      const threeWordPhrase = i < words.length - 2 ? `${word} ${words[i + 1]} ${words[i + 2]}` : '';
      
      if (MESH_MAPPINGS[threeWordPhrase] && !processedTerms.has(threeWordPhrase)) {
        const meshTerms = MESH_MAPPINGS[threeWordPhrase];
        const meshQuery = meshTerms.map(term => `"${term}"[MeSH Terms]`).join(' OR ');
        
        if (meshTerms.length > 1) {
          queryParts.push(`(${meshQuery})`);
        } else {
          queryParts.push(meshQuery);
        }
        
        meshTermsUsed.push(...meshTerms);
        fieldTagsUsed.push('[MeSH Terms]');
        processedTerms.add(threeWordPhrase);
        improvements.push(`Added MeSH terms for "${threeWordPhrase}": ${meshTerms.join(', ')}`);
        i += 2; // Skip next two words
      }
      else if (MESH_MAPPINGS[twoWordPhrase] && !processedTerms.has(twoWordPhrase)) {
        const meshTerms = MESH_MAPPINGS[twoWordPhrase];
        const meshQuery = meshTerms.map(term => `"${term}"[MeSH Terms]`).join(' OR ');
        
        if (meshTerms.length > 1) {
          queryParts.push(`(${meshQuery})`);
        } else {
          queryParts.push(meshQuery);
        }
        
        meshTermsUsed.push(...meshTerms);
        fieldTagsUsed.push('[MeSH Terms]');
        processedTerms.add(twoWordPhrase);
        improvements.push(`Added MeSH terms for "${twoWordPhrase}": ${meshTerms.join(', ')}`);
        i += 1; // Skip next word
      }
      else if (!processedTerms.has(word)) {
        // Keep original word with text word tag for broader search
        queryParts.push(`"${word}"[tw]`);
        fieldTagsUsed.push('[tw]');
        processedTerms.add(word);
      }
    }
    else if (!processedTerms.has(word)) {
      // Single word with no MeSH mapping
      queryParts.push(`"${word}"[tw]`);
      fieldTagsUsed.push('[tw]');
      processedTerms.add(word);
    }
  }
  
  // Join query parts with AND
  let optimizedQuery = queryParts.join(' AND ');
  
  // Add general improvements
  if (meshTermsUsed.length > 0) {
    improvements.push(`Applied MeSH standardization for better precision`);
  }
  
  if (fieldTagsUsed.includes('[tw]')) {
    improvements.push(`Added text word tags for comprehensive search`);
  }
  
  // Add parentheses for complex queries
  if (queryParts.length > 2) {
    improvements.push(`Structured query with proper boolean logic`);
  }
  
  // If no improvements were made, provide a basic optimization
  if (improvements.length === 0) {
    optimizedQuery = `"${originalQuery}"[tw]`;
    improvements.push(`Added text word field tag for better search targeting`);
    fieldTagsUsed.push('[tw]');
  }
  
  // Get estimated results by running a quick search
  let estimatedResults: number | undefined;
  try {
    const searchResult = await searchPubMed(optimizedQuery, 1);
    estimatedResults = searchResult.count;
    improvements.push(`Estimated ${estimatedResults.toLocaleString()} results with optimized query`);
  } catch (error) {
    // If search fails, don't include estimated results
  }
  
  return {
    originalQuery,
    optimizedQuery,
    improvements,
    meshTermsUsed: [...new Set(meshTermsUsed)], // Remove duplicates
    fieldTagsUsed: [...new Set(fieldTagsUsed)], // Remove duplicates
    estimatedResults
  };
}