"""
Apollo.io API Service

Provides company and contact enrichment via Apollo's API.
Used for sales intelligence - looking up companies and people.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)


@dataclass
class CompanyInfo:
    """Enriched company information"""
    name: str
    domain: str
    industry: Optional[str] = None
    employee_count: Optional[int] = None
    founded_year: Optional[int] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    logo_url: Optional[str] = None
    technologies: List[str] = None
    keywords: List[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "domain": self.domain,
            "industry": self.industry,
            "employee_count": self.employee_count,
            "founded_year": self.founded_year,
            "linkedin_url": self.linkedin_url,
            "website_url": self.website_url,
            "description": self.description,
            "location": {
                "city": self.city,
                "state": self.state,
                "country": self.country
            } if any([self.city, self.state, self.country]) else None,
            "logo_url": self.logo_url,
            "technologies": self.technologies or [],
            "keywords": self.keywords or []
        }


@dataclass
class PersonInfo:
    """Enriched person information"""
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "company": self.company,
            "email": self.email,
            "phone": self.phone,
            "linkedin_url": self.linkedin_url,
            "location": {
                "city": self.city,
                "state": self.state,
                "country": self.country
            } if any([self.city, self.state, self.country]) else None
        }


class ApolloService:
    """
    Apollo.io API client for company and contact enrichment.

    Free plan supports:
    - Organization enrichment (domain -> company data)
    - Organization search (find companies by name)
    - Contacts/Accounts search (your saved data)

    Paid plan adds:
    - People search (find contacts at companies)
    - People enrichment (email/LinkedIn -> full profile)
    """

    BASE_URL = "https://api.apollo.io/api/v1"

    def __init__(self):
        self.api_key = os.getenv("APOLLO_API_KEY")
        self._headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self.api_key or ""
        }

    def is_configured(self) -> bool:
        """Check if Apollo API key is configured"""
        return bool(self.api_key)

    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict[str, Any]:
        """Make API request to Apollo"""
        url = f"{self.BASE_URL}/{endpoint}"

        try:
            if method == "GET":
                response = requests.get(url, headers=self._headers, params=data)
            else:
                response = requests.post(url, headers=self._headers, json=data or {})

            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                error_data = e.response.json()
                raise PermissionError(f"Apollo API access denied: {error_data.get('error', 'Requires paid plan')}")
            raise
        except Exception as e:
            logger.error(f"Apollo API error: {e}")
            raise

    # ==================
    # Company Methods
    # ==================

    def enrich_company(self, domain: str) -> Optional[CompanyInfo]:
        """
        Enrich company data from domain.

        Args:
            domain: Company domain (e.g., "anthropic.com")

        Returns:
            CompanyInfo with enriched data, or None if not found
        """
        if not self.is_configured():
            raise ValueError("Apollo API key not configured")

        try:
            data = self._request("POST", "organizations/enrich", {"domain": domain})
            org = data.get("organization")

            if not org:
                return None

            return CompanyInfo(
                name=org.get("name", ""),
                domain=domain,
                industry=org.get("industry"),
                employee_count=org.get("estimated_num_employees"),
                founded_year=org.get("founded_year"),
                linkedin_url=org.get("linkedin_url"),
                website_url=org.get("website_url"),
                description=org.get("short_description"),
                city=org.get("city"),
                state=org.get("state"),
                country=org.get("country"),
                logo_url=org.get("logo_url"),
                technologies=org.get("technologies", []),
                keywords=org.get("keywords", [])
            )
        except Exception as e:
            logger.error(f"Failed to enrich company {domain}: {e}")
            return None

    def search_companies(
        self,
        name: Optional[str] = None,
        domain: Optional[str] = None,
        industry: Optional[str] = None,
        employee_min: Optional[int] = None,
        employee_max: Optional[int] = None,
        page: int = 1,
        per_page: int = 10
    ) -> List[CompanyInfo]:
        """
        Search for companies by various criteria.

        Args:
            name: Company name to search
            domain: Domain to search
            industry: Industry filter
            employee_min: Minimum employee count
            employee_max: Maximum employee count
            page: Page number
            per_page: Results per page

        Returns:
            List of matching CompanyInfo objects
        """
        if not self.is_configured():
            raise ValueError("Apollo API key not configured")

        params = {
            "page": page,
            "per_page": per_page
        }

        if name:
            params["q_organization_name"] = name
        if domain:
            params["q_organization_domains"] = domain
        if industry:
            params["organization_industry_tag_ids"] = [industry]
        if employee_min or employee_max:
            params["organization_num_employees_ranges"] = []
            if employee_min and employee_max:
                params["organization_num_employees_ranges"].append(f"{employee_min},{employee_max}")

        try:
            data = self._request("POST", "organizations/search", params)
            organizations = data.get("organizations", [])

            return [
                CompanyInfo(
                    name=org.get("name", ""),
                    domain=org.get("primary_domain", ""),
                    industry=org.get("industry"),
                    employee_count=org.get("estimated_num_employees"),
                    founded_year=org.get("founded_year"),
                    linkedin_url=org.get("linkedin_url"),
                    website_url=org.get("website_url"),
                    description=org.get("short_description"),
                    city=org.get("city"),
                    state=org.get("state"),
                    country=org.get("country"),
                    logo_url=org.get("logo_url")
                )
                for org in organizations
            ]
        except Exception as e:
            logger.error(f"Failed to search companies: {e}")
            return []

    # ==================
    # People Methods (Paid Plan)
    # ==================

    def search_people(
        self,
        company_domains: Optional[List[str]] = None,
        titles: Optional[List[str]] = None,
        seniority: Optional[List[str]] = None,
        page: int = 1,
        per_page: int = 10
    ) -> List[PersonInfo]:
        """
        Search for people at companies.

        NOTE: Requires paid Apollo plan.

        Args:
            company_domains: List of company domains to search
            titles: Job titles to filter by
            seniority: Seniority levels (e.g., ["c_suite", "vp", "director"])
            page: Page number
            per_page: Results per page

        Returns:
            List of matching PersonInfo objects
        """
        if not self.is_configured():
            raise ValueError("Apollo API key not configured")

        params = {
            "page": page,
            "per_page": per_page
        }

        if company_domains:
            params["q_organization_domains"] = company_domains
        if titles:
            params["person_titles"] = titles
        if seniority:
            params["person_seniorities"] = seniority

        try:
            data = self._request("POST", "mixed_people/search", params)
            people = data.get("people", [])

            return [
                PersonInfo(
                    name=p.get("name", ""),
                    title=p.get("title"),
                    company=p.get("organization", {}).get("name"),
                    email=p.get("email"),
                    phone=p.get("phone_numbers", [{}])[0].get("number") if p.get("phone_numbers") else None,
                    linkedin_url=p.get("linkedin_url"),
                    city=p.get("city"),
                    state=p.get("state"),
                    country=p.get("country")
                )
                for p in people
            ]
        except PermissionError:
            logger.warning("People search requires paid Apollo plan")
            raise
        except Exception as e:
            logger.error(f"Failed to search people: {e}")
            return []

    def enrich_person(
        self,
        email: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        name: Optional[str] = None,
        company: Optional[str] = None
    ) -> Optional[PersonInfo]:
        """
        Enrich person data from email or LinkedIn URL.

        NOTE: Requires paid Apollo plan.

        Args:
            email: Person's email
            linkedin_url: Person's LinkedIn URL
            name: Person's name (helps matching)
            company: Company name (helps matching)

        Returns:
            PersonInfo with enriched data, or None if not found
        """
        if not self.is_configured():
            raise ValueError("Apollo API key not configured")

        if not email and not linkedin_url:
            raise ValueError("Either email or linkedin_url is required")

        params = {}
        if email:
            params["email"] = email
        if linkedin_url:
            params["linkedin_url"] = linkedin_url
        if name:
            params["first_name"] = name.split()[0] if " " in name else name
            if " " in name:
                params["last_name"] = name.split()[-1]
        if company:
            params["organization_name"] = company

        try:
            data = self._request("POST", "people/match", params)
            person = data.get("person")

            if not person:
                return None

            return PersonInfo(
                name=person.get("name", ""),
                title=person.get("title"),
                company=person.get("organization", {}).get("name"),
                email=person.get("email"),
                phone=person.get("phone_numbers", [{}])[0].get("number") if person.get("phone_numbers") else None,
                linkedin_url=person.get("linkedin_url"),
                city=person.get("city"),
                state=person.get("state"),
                country=person.get("country")
            )
        except PermissionError:
            logger.warning("People enrichment requires paid Apollo plan")
            raise
        except Exception as e:
            logger.error(f"Failed to enrich person: {e}")
            return None


# Singleton instance
_apollo_service: Optional[ApolloService] = None


def get_apollo_service() -> ApolloService:
    """Get or create Apollo service singleton"""
    global _apollo_service
    if _apollo_service is None:
        _apollo_service = ApolloService()
    return _apollo_service
