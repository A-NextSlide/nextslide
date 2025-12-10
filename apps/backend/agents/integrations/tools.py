"""
Integration tool implementations.

Each tool wraps a Nango integration and provides a clean interface
for the AI agent to use.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod

from services.nango_service import get_nango_service
from services.apollo_service import get_apollo_service

logger = logging.getLogger(__name__)


@dataclass
class IntegrationToolResult:
    """Result from an integration tool call"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class BaseIntegrationTool(ABC):
    """Base class for integration tools"""

    provider: str  # Nango provider key
    name: str  # Tool name for Claude
    description: str  # Tool description

    def __init__(self, connection_id: str, user_id: str):
        self.connection_id = connection_id
        self.user_id = user_id
        self.nango = get_nango_service()

    def proxy(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make a proxied request through Nango"""
        return self.nango.proxy(
            method=method,
            endpoint=endpoint,
            provider=self.provider,
            connection_id=self.connection_id,
            data=data,
            params=params
        )

    @abstractmethod
    def get_tool_definition(self) -> Dict[str, Any]:
        """Get Claude-compatible tool definition"""
        pass

    @abstractmethod
    def execute(self, **kwargs) -> IntegrationToolResult:
        """Execute the tool with given parameters"""
        pass


# ==================
# LinkedIn Tools
# ==================

class LinkedInLookupTool(BaseIntegrationTool):
    """Look up LinkedIn profiles and companies"""

    provider = "linkedin"
    name = "linkedin_lookup"
    description = "Look up a person or company on LinkedIn to get profile information for personalized content"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "lookup_type": {
                        "type": "string",
                        "enum": ["person", "company"],
                        "description": "Whether to look up a person or company"
                    },
                    "linkedin_url": {
                        "type": "string",
                        "description": "LinkedIn profile or company URL (optional if name provided)"
                    },
                    "name": {
                        "type": "string",
                        "description": "Person or company name to search for"
                    },
                    "company": {
                        "type": "string",
                        "description": "Company name (for person lookup, helps narrow search)"
                    }
                },
                "required": ["lookup_type"]
            }
        }

    def execute(
        self,
        lookup_type: str = "person",
        linkedin_url: Optional[str] = None,
        name: Optional[str] = None,
        company: Optional[str] = None,
        **kwargs
    ) -> IntegrationToolResult:
        try:
            if lookup_type == "person":
                # Get basic profile
                result = self.proxy("GET", "/v2/me")
                return IntegrationToolResult(
                    success=True,
                    data={
                        "type": "person",
                        "profile": result,
                        "source": "linkedin"
                    }
                )
            else:
                # Company lookup
                result = self.proxy("GET", "/v2/organizations", params={"q": name})
                return IntegrationToolResult(
                    success=True,
                    data={
                        "type": "company",
                        "company": result,
                        "source": "linkedin"
                    }
                )
        except Exception as e:
            logger.error(f"LinkedIn lookup failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Salesforce Tools
# ==================

class SalesforceLookupTool(BaseIntegrationTool):
    """Search and retrieve Salesforce records"""

    provider = "salesforce"
    name = "salesforce_lookup"
    description = "Search Salesforce for contacts, accounts, opportunities, or other records"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "object_type": {
                        "type": "string",
                        "enum": ["Contact", "Account", "Opportunity", "Lead"],
                        "description": "Type of Salesforce object to search"
                    },
                    "search_query": {
                        "type": "string",
                        "description": "Search query (name, email, or SOQL WHERE clause)"
                    },
                    "fields": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific fields to retrieve (optional)"
                    }
                },
                "required": ["object_type", "search_query"]
            }
        }

    def execute(
        self,
        object_type: str,
        search_query: str,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> IntegrationToolResult:
        try:
            # Build SOQL query
            field_list = ", ".join(fields) if fields else "Id, Name"
            if object_type == "Contact":
                field_list = fields and ", ".join(fields) or "Id, Name, Email, Title, Account.Name"
            elif object_type == "Account":
                field_list = fields and ", ".join(fields) or "Id, Name, Industry, Website, Description"
            elif object_type == "Opportunity":
                field_list = fields and ", ".join(fields) or "Id, Name, StageName, Amount, CloseDate, Account.Name"

            # Simple name search
            soql = f"SELECT {field_list} FROM {object_type} WHERE Name LIKE '%{search_query}%' LIMIT 10"

            result = self.proxy(
                "GET",
                "/services/data/v59.0/query",
                params={"q": soql}
            )

            return IntegrationToolResult(
                success=True,
                data={
                    "object_type": object_type,
                    "records": result.get("records", []),
                    "total": result.get("totalSize", 0),
                    "source": "salesforce"
                }
            )
        except Exception as e:
            logger.error(f"Salesforce lookup failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Gmail Tools
# ==================

class GmailSearchTool(BaseIntegrationTool):
    """Search Gmail for emails"""

    provider = "google-mail"
    name = "gmail_search"
    description = "Search emails to find relevant conversations, attachments, or context"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Gmail search query (e.g., 'from:john@example.com subject:proposal')"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of emails to return (default: 5)"
                    }
                },
                "required": ["query"]
            }
        }

    def execute(
        self,
        query: str,
        max_results: int = 5,
        **kwargs
    ) -> IntegrationToolResult:
        try:
            # Search messages
            search_result = self.proxy(
                "GET",
                "/gmail/v1/users/me/messages",
                params={"q": query, "maxResults": max_results}
            )

            messages = []
            for msg in search_result.get("messages", [])[:max_results]:
                # Get full message
                full_msg = self.proxy(
                    "GET",
                    f"/gmail/v1/users/me/messages/{msg['id']}",
                    params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]}
                )

                headers = {h["name"]: h["value"] for h in full_msg.get("payload", {}).get("headers", [])}
                messages.append({
                    "id": msg["id"],
                    "subject": headers.get("Subject", ""),
                    "from": headers.get("From", ""),
                    "date": headers.get("Date", ""),
                    "snippet": full_msg.get("snippet", "")
                })

            return IntegrationToolResult(
                success=True,
                data={
                    "emails": messages,
                    "total_found": len(messages),
                    "source": "gmail"
                }
            )
        except Exception as e:
            logger.error(f"Gmail search failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Google Drive Tools
# ==================

class GoogleDriveTool(BaseIntegrationTool):
    """Access Google Drive files and documents"""

    provider = "google-drive"
    name = "google_drive"
    description = "Search and read files from Google Drive including Docs, Sheets, and Slides"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["search", "read", "list_recent"],
                        "description": "Action to perform"
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query for files (for search action)"
                    },
                    "file_id": {
                        "type": "string",
                        "description": "File ID to read (for read action)"
                    },
                    "file_type": {
                        "type": "string",
                        "enum": ["document", "spreadsheet", "presentation", "any"],
                        "description": "Filter by file type"
                    }
                },
                "required": ["action"]
            }
        }

    def execute(
        self,
        action: str,
        query: Optional[str] = None,
        file_id: Optional[str] = None,
        file_type: str = "any",
        **kwargs
    ) -> IntegrationToolResult:
        try:
            if action == "search":
                # Build search query
                q = f"name contains '{query}'" if query else ""
                if file_type == "document":
                    q += " and mimeType='application/vnd.google-apps.document'"
                elif file_type == "spreadsheet":
                    q += " and mimeType='application/vnd.google-apps.spreadsheet'"
                elif file_type == "presentation":
                    q += " and mimeType='application/vnd.google-apps.presentation'"

                result = self.proxy(
                    "GET",
                    "/drive/v3/files",
                    params={"q": q, "fields": "files(id,name,mimeType,modifiedTime)"}
                )

                return IntegrationToolResult(
                    success=True,
                    data={
                        "files": result.get("files", []),
                        "source": "google_drive"
                    }
                )

            elif action == "read" and file_id:
                # Get file metadata and content
                metadata = self.proxy("GET", f"/drive/v3/files/{file_id}")

                # Export as text if it's a Google Doc
                mime_type = metadata.get("mimeType", "")
                content = None

                if "google-apps.document" in mime_type:
                    content = self.proxy(
                        "GET",
                        f"/drive/v3/files/{file_id}/export",
                        params={"mimeType": "text/plain"}
                    )
                elif "google-apps.spreadsheet" in mime_type:
                    content = self.proxy(
                        "GET",
                        f"/drive/v3/files/{file_id}/export",
                        params={"mimeType": "text/csv"}
                    )

                return IntegrationToolResult(
                    success=True,
                    data={
                        "file": metadata,
                        "content": content,
                        "source": "google_drive"
                    }
                )

            elif action == "list_recent":
                result = self.proxy(
                    "GET",
                    "/drive/v3/files",
                    params={
                        "orderBy": "modifiedTime desc",
                        "pageSize": 10,
                        "fields": "files(id,name,mimeType,modifiedTime)"
                    }
                )

                return IntegrationToolResult(
                    success=True,
                    data={
                        "files": result.get("files", []),
                        "source": "google_drive"
                    }
                )

            return IntegrationToolResult(success=False, error="Invalid action")

        except Exception as e:
            logger.error(f"Google Drive operation failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Notion Tools
# ==================

class NotionTool(BaseIntegrationTool):
    """Access Notion pages and databases"""

    provider = "notion"
    name = "notion"
    description = "Search and read Notion pages and databases for content"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["search", "read_page", "query_database"],
                        "description": "Action to perform"
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "page_id": {
                        "type": "string",
                        "description": "Page ID to read"
                    },
                    "database_id": {
                        "type": "string",
                        "description": "Database ID to query"
                    }
                },
                "required": ["action"]
            }
        }

    def execute(
        self,
        action: str,
        query: Optional[str] = None,
        page_id: Optional[str] = None,
        database_id: Optional[str] = None,
        **kwargs
    ) -> IntegrationToolResult:
        try:
            if action == "search":
                result = self.proxy(
                    "POST",
                    "/v1/search",
                    data={"query": query or "", "page_size": 10}
                )

                return IntegrationToolResult(
                    success=True,
                    data={
                        "results": result.get("results", []),
                        "source": "notion"
                    }
                )

            elif action == "read_page" and page_id:
                # Get page content
                page = self.proxy("GET", f"/v1/pages/{page_id}")
                blocks = self.proxy("GET", f"/v1/blocks/{page_id}/children")

                # Extract text from blocks
                content = self._extract_notion_text(blocks.get("results", []))

                return IntegrationToolResult(
                    success=True,
                    data={
                        "page": page,
                        "content": content,
                        "source": "notion"
                    }
                )

            elif action == "query_database" and database_id:
                result = self.proxy(
                    "POST",
                    f"/v1/databases/{database_id}/query",
                    data={"page_size": 20}
                )

                return IntegrationToolResult(
                    success=True,
                    data={
                        "results": result.get("results", []),
                        "source": "notion"
                    }
                )

            return IntegrationToolResult(success=False, error="Invalid action or missing parameters")

        except Exception as e:
            logger.error(f"Notion operation failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))

    def _extract_notion_text(self, blocks: List[Dict]) -> str:
        """Extract plain text from Notion blocks"""
        text_parts = []
        for block in blocks:
            block_type = block.get("type", "")
            if block_type in ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item"]:
                rich_text = block.get(block_type, {}).get("rich_text", [])
                for rt in rich_text:
                    text_parts.append(rt.get("plain_text", ""))
        return "\n".join(text_parts)


# ==================
# Slack Tools
# ==================

class SlackSearchTool(BaseIntegrationTool):
    """Search Slack messages and channels"""

    provider = "slack"
    name = "slack_search"
    description = "Search Slack for messages and conversations"

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for messages"
                    },
                    "channel": {
                        "type": "string",
                        "description": "Channel name to search in (optional)"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum results to return (default: 10)"
                    }
                },
                "required": ["query"]
            }
        }

    def execute(
        self,
        query: str,
        channel: Optional[str] = None,
        max_results: int = 10,
        **kwargs
    ) -> IntegrationToolResult:
        try:
            search_query = query
            if channel:
                search_query = f"in:#{channel} {query}"

            result = self.proxy(
                "GET",
                "/api/search.messages",
                params={"query": search_query, "count": max_results}
            )

            messages = []
            for match in result.get("messages", {}).get("matches", []):
                messages.append({
                    "text": match.get("text", ""),
                    "user": match.get("username", ""),
                    "channel": match.get("channel", {}).get("name", ""),
                    "timestamp": match.get("ts", ""),
                    "permalink": match.get("permalink", "")
                })

            return IntegrationToolResult(
                success=True,
                data={
                    "messages": messages,
                    "total": len(messages),
                    "source": "slack"
                }
            )
        except Exception as e:
            logger.error(f"Slack search failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Apollo Tools (Direct API - No OAuth Required)
# ==================

class ApolloCompanyTool:
    """
    Look up company information via Apollo.io.

    This tool uses Apollo's API directly (no user OAuth needed).
    Works on free plan for company enrichment.
    """

    name = "apollo_company_lookup"
    description = "Look up company information including industry, size, description, and LinkedIn. Use this when you need business intelligence about a company."

    def __init__(self):
        self.apollo = get_apollo_service()

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Company domain/website (e.g., 'anthropic.com', 'stripe.com')"
                    },
                    "company_name": {
                        "type": "string",
                        "description": "Company name to search for (if domain not known)"
                    }
                }
            }
        }

    def execute(
        self,
        domain: Optional[str] = None,
        company_name: Optional[str] = None,
        **kwargs
    ) -> IntegrationToolResult:
        if not self.apollo.is_configured():
            return IntegrationToolResult(
                success=False,
                error="Apollo API not configured"
            )

        try:
            if domain:
                # Direct enrichment
                company = self.apollo.enrich_company(domain)
                if company:
                    return IntegrationToolResult(
                        success=True,
                        data={
                            "company": company.to_dict(),
                            "source": "apollo"
                        }
                    )
                return IntegrationToolResult(
                    success=False,
                    error=f"No company found for domain: {domain}"
                )

            elif company_name:
                # Search by name
                companies = self.apollo.search_companies(name=company_name, per_page=3)
                if companies:
                    return IntegrationToolResult(
                        success=True,
                        data={
                            "companies": [c.to_dict() for c in companies],
                            "source": "apollo"
                        }
                    )
                return IntegrationToolResult(
                    success=False,
                    error=f"No companies found for: {company_name}"
                )

            return IntegrationToolResult(
                success=False,
                error="Either domain or company_name is required"
            )

        except Exception as e:
            logger.error(f"Apollo company lookup failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


class ApolloPersonTool:
    """
    Look up person/contact information via Apollo.io.

    NOTE: Requires paid Apollo plan for people search/enrichment.
    """

    name = "apollo_person_lookup"
    description = "Look up a person's professional information including title, company, email, and contact details. Requires paid Apollo plan."

    def __init__(self):
        self.apollo = get_apollo_service()

    def get_tool_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "email": {
                        "type": "string",
                        "description": "Person's email address"
                    },
                    "linkedin_url": {
                        "type": "string",
                        "description": "Person's LinkedIn profile URL"
                    },
                    "name": {
                        "type": "string",
                        "description": "Person's full name"
                    },
                    "company_domain": {
                        "type": "string",
                        "description": "Company domain to search within"
                    },
                    "title": {
                        "type": "string",
                        "description": "Job title to filter by"
                    }
                }
            }
        }

    def execute(
        self,
        email: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        name: Optional[str] = None,
        company_domain: Optional[str] = None,
        title: Optional[str] = None,
        **kwargs
    ) -> IntegrationToolResult:
        if not self.apollo.is_configured():
            return IntegrationToolResult(
                success=False,
                error="Apollo API not configured"
            )

        try:
            # Try enrichment first if we have email or LinkedIn
            if email or linkedin_url:
                person = self.apollo.enrich_person(
                    email=email,
                    linkedin_url=linkedin_url,
                    name=name,
                    company=company_domain
                )
                if person:
                    return IntegrationToolResult(
                        success=True,
                        data={
                            "person": person.to_dict(),
                            "source": "apollo"
                        }
                    )

            # Fall back to search if we have company/title
            if company_domain or title:
                people = self.apollo.search_people(
                    company_domains=[company_domain] if company_domain else None,
                    titles=[title] if title else None,
                    per_page=5
                )
                if people:
                    return IntegrationToolResult(
                        success=True,
                        data={
                            "people": [p.to_dict() for p in people],
                            "source": "apollo"
                        }
                    )

            return IntegrationToolResult(
                success=False,
                error="No results found. Try providing more details."
            )

        except PermissionError as e:
            return IntegrationToolResult(
                success=False,
                error="People lookup requires a paid Apollo plan. Company lookup is available on free plan."
            )
        except Exception as e:
            logger.error(f"Apollo person lookup failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))


# ==================
# Tool Registry
# ==================

TOOL_CLASSES = {
    "linkedin": LinkedInLookupTool,
    "salesforce": SalesforceLookupTool,
    "hubspot": SalesforceLookupTool,  # Similar API structure
    "google-mail": GmailSearchTool,
    "gmail": GmailSearchTool,
    "google-drive": GoogleDriveTool,
    "notion": NotionTool,
    "slack": SlackSearchTool,
}

# Apollo tools don't need Nango/OAuth - they use direct API
DIRECT_API_TOOLS = {
    "apollo_company": ApolloCompanyTool,
    "apollo_person": ApolloPersonTool,
}


def create_tool(provider: str, connection_id: str, user_id: str) -> Optional[BaseIntegrationTool]:
    """Create a tool instance for a given provider"""
    tool_class = TOOL_CLASSES.get(provider)
    if tool_class:
        return tool_class(connection_id=connection_id, user_id=user_id)
    return None


def get_apollo_tools() -> List[Dict[str, Any]]:
    """
    Get Apollo tools that are always available (no user OAuth needed).
    These use our API key directly.
    """
    apollo = get_apollo_service()
    if not apollo.is_configured():
        return []

    tools = []

    # Company tool is always available (free plan)
    company_tool = ApolloCompanyTool()
    tools.append({
        "definition": company_tool.get_tool_definition(),
        "instance": company_tool
    })

    # Person tool requires paid plan but we still expose it
    # (it will return helpful error if used without paid plan)
    person_tool = ApolloPersonTool()
    tools.append({
        "definition": person_tool.get_tool_definition(),
        "instance": person_tool
    })

    return tools
