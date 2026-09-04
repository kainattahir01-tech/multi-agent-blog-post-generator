import os
import json
import asyncio
from typing import AsyncGenerator
from fastapi import FastAPI, Header, Query, HTTPException, status
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Multi-Agent Blog Post Generator",
    description="A multi-agent sequential blog post generator powered by Gemini",
    version="1.0.0"
)

# Create directories if they don't exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("templates/index.html")

# System instructions for agents
RESEARCH_AGENT_INSTRUCTIONS = """You are an expert research agent. Given a topic, your job is to gather key points, facts, and structure on that topic.
Format your output as markdown bullet points. Structure your findings into logical sections (e.g., Background, Key Statistics/Trends, Core Arguments, Future Outlook).
Provide deep, insightful, and informative facts. Do not write a blog post; write a comprehensive research brief."""

WRITING_AGENT_INSTRUCTIONS = """You are a professional copywriter. Your job is to take a research brief and turn it into a compelling first draft of a blog post.
The blog post should be structured with headings, subheadings, and a clear intro, body, and conclusion.
Target Tone: {tone}
Target Length: {length}
Topic: {topic}

Write in Markdown. Use the provided research brief below to build the content, expanding on the details and ensuring smooth transitions between points. Do not include meta-commentary.
Important — Write the entire blog post in {language} only."""

EDITING_AGENT_INSTRUCTIONS = """You are a professional chief editor. Your job is to polish the first draft of a blog post into a final, publish-ready version.
Focus on:
1. Sentence flow, readability, and engagement.
2. Enhancing the vocabulary and checking grammar/spelling.
3. Structuring and formatting consistency (clean markdown).
4. Ensuring a strong intro and call to action.

Output the final, polished blog post in Markdown format. Do not include any editor notes, comments, or intro/outro text, only the polished markdown content."""

SEO_AGENT_INSTRUCTIONS = """You are an SEO specialist. Given a blog post, extract 5 focus keywords, write a meta description under 160 characters, suggest 3 SEO title variations, and give a readability score out of 10 with one line of feedback. Format as markdown."""

def get_api_key(x_api_key: str = Header(None), api_key: str = Query(None)) -> str:
    # Check query param first
    if api_key:
        return api_key
    # Check request header second
    if x_api_key:
        return x_api_key
    # Check env var third
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key:
        return env_key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Gemini API Key not found. Please provide it in the input field, via X-API-Key header, or set GEMINI_API_KEY in the environment."
    )

def sse_message(data: dict) -> str:
    """Helper to safely format SSE data payloads without f-string quote or backslash issues."""
    return "data: " + json.dumps(data) + "\n\n"

async def run_mock_pipeline(topic: str, tone: str, length: str) -> AsyncGenerator[str, None]:
    # Yield research start
    yield sse_message({
        'event': 'status',
        'agent': 'research',
        'status': 'start',
        'message': f"Research Agent (SIMULATED): Conducting research on '{topic}'..."
    })
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)
    
    research_text = f"""# Research Brief: {topic}

## 1. Background & Definition
* **Core Concept**: Understanding the fundamentals and core principles of {topic}.
* **Historical Context**: Emerging trends in recent years showing a 45% increase in user interest.
* **Key Driving Factors**: Growing demand, technological access, and search trends.

## 2. Key Trends & Statistics
* **Growth Projection**: Expected market size growth with a compound annual growth rate (CAGR) of 22.4% over the next 5 years.
* **Demographic Shift**: Broadening adoption among professionals, educators, and industry leaders.
* **Technological Integration**: Synergy with modern web platforms, APIs, and cloud services.

## 3. Core Arguments & Benefits
* **Productivity**: Enables teams to execute workflows up to 3x faster than manual methods.
* **Cost Efficiency**: Streamlines repetitive paths, directly reducing operational overhead.
* **Insights**: Uncovers data patterns, improving overall strategic decision accuracy.

## 4. Challenges & Limitations
* **Privacy & Security**: Compliance concerns regarding data protection and storage.
* **Adoption Friction**: Organizational resistance to changing existing legacy workflows.
* **Resource Demands**: Training requirements and initial configuration hurdles."""

    # Stream research text in small chunks
    chunk_size = 40
    for i in range(0, len(research_text), chunk_size):
        chunk = research_text[i:i+chunk_size]
        yield sse_message({'event': 'content', 'agent': 'research', 'text': chunk})
        await asyncio.sleep(0)
        await asyncio.sleep(0.04)

    yield sse_message({'event': 'status', 'agent': 'research', 'status': 'done', 'message': 'Research Agent: Completed research brief.'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Yield writer start
    yield sse_message({'event': 'status', 'agent': 'writer', 'status': 'start', 'message': 'Writing Agent (SIMULATED): Drafting blog post using research brief...'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    writer_text = f"""# The Rise of {topic}: Unlocking Opportunities and Navigating Challenges

In today's fast-moving digital environment, `{topic}` is rapidly emerging as a critical pillar. Whether you are an industry practitioner or a curious observer, understanding this shift is essential.

## Background and Foundation
To fully appreciate `{topic}`, we must look at its origin. Born out of research demands and digital growth, it represents a transition from conceptual tools to fully integrated systems. Analysts note that interest and implementation requests have increased significantly in recent years.

## Current Trends & Key Statistics
The numbers tell a compelling story. The market surrounding `{topic}` is projected to grow exponentially, maintaining a compound annual growth rate of 22.4% over the next half-decade. We are seeing major organizations allocating substantial resources here, signaling that this is a long-term transition.

## Why It Matters: Key Benefits
There are several clear reasons why `{topic}` is gaining momentum:
* **Drastic Productivity Gains**: Users report completing critical work up to three times faster than before.
* **Resource Optimization**: Automating complex paths directly reduces administrative overhead and costs.
* **Informed Decisions**: Analyzing structures in real time helps uncover insights that were previously hidden.

## The Hurdles Ahead
However, the road is not without obstacles. Data privacy is a primary concern, as sensitive information must be processed securely. Furthermore, adoption friction is a real barrier, as teams must invest time in learning new systems and workflows.

## Summary
Ultimately, `{topic}` is set to redefine how we operate. By focusing on the benefits while proactively solving the challenges, organizations can position themselves at the forefront of this revolution."""

    for i in range(0, len(writer_text), chunk_size):
        chunk = writer_text[i:i+chunk_size]
        yield sse_message({'event': 'content', 'agent': 'writer', 'text': chunk})
        await asyncio.sleep(0)
        await asyncio.sleep(0.04)

    yield sse_message({'event': 'status', 'agent': 'writer', 'status': 'done', 'message': 'Writing Agent: Completed first draft.'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Yield editor start
    yield sse_message({'event': 'status', 'agent': 'editor', 'status': 'start', 'message': 'Editing Agent (SIMULATED): Polishing the blog post draft...'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    editor_text = f"""# The Revolution of {topic}: How to Unlock Opportunities and Navigate Challenges

In our rapidly evolving digital landscape, **{topic}** has transcended its status as a mere buzzword to become a critical pillar of modern innovation. For leaders, creators, and teams looking to stay ahead, understanding its strategic value is no longer optional—it is a competitive necessity.

---

## 1. The Genesis of a New Era
To comprehend the full impact of **{topic}**, one must examine its trajectory. Originally conceived as a specialized solution for specific research challenges, it has matured alongside cloud scalability and advanced algorithms. Today, the demand for this technology is surging, driven by a growing recognition of its capabilities.

## 2. Market Projections and Adoption Patterns
The metrics speak for themselves. The industry is on track to maintain a remarkable **22.4% Compound Annual Growth Rate (CAGR)** over the next five years. This growth is fueled by broad-based adoption across sectors, with early adopters reporting a significant edge over traditional competitors.

## 3. High-Impact Advantages
Why are organizations accelerating their implementation? The return on investment is driven by three main pillars:
* 🚀 **Exponential Productivity:** Streamlining complex workflows enables teams to execute tasks up to three times faster.
* 💡 **Resource Optimization:** Replacing manual, repetitive processes with intelligent automation reduces operational costs and minimizes errors.
* 📊 **Strategic Intelligence:** Uncovering deep patterns in real-time data allows for faster, more accurate decision-making.

## 4. Key Barriers to Adoption
Despite these promising benefits, successful deployment requires navigating critical challenges:
* **Data Integrity & Compliance:** Managing security and ensuring strict adherence to privacy regulations.
* **Cultural Shift:** Overcoming internal resistance by demonstrating early wins and providing comprehensive training.
* **Scalability Bottlenecks:** Designing systems that can handle increased data loads without performance degradation.

---

## Conclusion & Next Steps
The shift toward **{topic}** represents a paradigm change. Organizations that take a proactive, structured approach to implementation—leveraging benefits while addressing security concerns—will define the future of their respective fields. 

*What is your strategy for integrating {topic} into your workflow?*"""

    for i in range(0, len(editor_text), chunk_size):
        chunk = editor_text[i:i+chunk_size]
        yield sse_message({'event': 'content', 'agent': 'editor', 'text': chunk})
        await asyncio.sleep(0)
        await asyncio.sleep(0.04)

    yield sse_message({'event': 'status', 'agent': 'editor', 'status': 'done', 'message': 'Editing Agent: Completed final edit.'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Yield SEO start
    yield sse_message({'event': 'status', 'agent': 'seo', 'status': 'start', 'message': 'SEO Agent (SIMULATED): Generating SEO optimization report...'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    seo_text = f"""# SEO Optimization Report: {topic}

## 1. Keyword Strategy
* **Primary Keyword:** `{topic}` (Expected monthly search volume: 4,500)
* **Secondary Keywords:** `{topic} guide`, `{topic} optimization`, `how to use {topic}`

## 2. Metadata Recommendation
* **SEO Meta Title:** The Ultimate Guide to {topic} | Step-by-Step Tutorial
* **Meta Description:** Discover how {topic} is transforming the industry. Learn the key benefits, major trends, and how to overcome challenges in our comprehensive guide.

## 3. SEO Content Health Checks
* **Readability Score:** Flesch-Kincaid Ease: 65.4 (Standard grade-level, optimal for general audiences).
* **Keyword Density:** 1.5% (Natural, non-stuffed distribution of primary keyword).
* **Headings Structure:** Headings H1, H2, and H3 flow logically and include relevant keywords.

## 4. Key Recommendations
* Add internal links to related case studies or product documentation.
* Use bullet lists and bold text (already present in polished output) to sustain scanning readers.
* Add an image with alt-text: "Overview diagram of {topic} implementation" in the intro section."""

    for i in range(0, len(seo_text), chunk_size):
        chunk = seo_text[i:i+chunk_size]
        yield sse_message({'event': 'content', 'agent': 'seo', 'text': chunk})
        await asyncio.sleep(0)
        await asyncio.sleep(0.04)

    yield sse_message({'event': 'status', 'agent': 'seo', 'status': 'done', 'message': 'SEO Agent: Completed SEO report.'})
    await asyncio.sleep(0)
    await asyncio.sleep(0.5)
    yield sse_message({'event': 'complete', 'message': 'All agents have completed their tasks (SIMULATED). Blog post and SEO report are ready!'})
    await asyncio.sleep(0)

async def run_agent_pipeline(
    topic: str,
    tone: str,
    length: str,
    api_key: str,
    language: str = "English"
) -> AsyncGenerator[str, None]:
    # FIX 4: Immediately yield connected event at the very top of run_agent_pipeline
    yield sse_message({'event': 'connected', 'message': 'Pipeline connected'})
    await asyncio.sleep(0)

    # FIX 3: Keepalive heartbeat tracking
    last_ping = asyncio.get_event_loop().time()

    if api_key == "mock":
        async for event in run_mock_pipeline(topic, tone, length):
            yield event
            await asyncio.sleep(0)
        return

    try:
        client = genai.Client(api_key=api_key)
        # Use gemini-3.6-flash as default model
        model_name = "gemini-3.6-flash"
    except Exception as e:
        yield sse_message({'event': 'error', 'message': f'Failed to initialize Gemini Client: {str(e)}'})
        await asyncio.sleep(0)
        return

    # Heartbeat check before first agent
    if asyncio.get_event_loop().time() - last_ping >= 15:
        last_ping = asyncio.get_event_loop().time()
        yield ": ping\n\n"
        await asyncio.sleep(0)

    research_output = ""
    for attempt in range(4):
        try:
            # Prompt for Research Agent
            research_prompt = f"Conduct comprehensive research and compile key facts, statistics, and subtopics for the topic: '{topic}'."
            
            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=research_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=RESEARCH_AGENT_INSTRUCTIONS,
                    temperature=0.4
                )
            )

            for chunk in response_stream:
                text = chunk.text or ""
                research_output += text
                yield sse_message({'event': 'content', 'agent': 'research', 'text': text})
                await asyncio.sleep(0)
                if asyncio.get_event_loop().time() - last_ping >= 15:
                    last_ping = asyncio.get_event_loop().time()
                    yield ": ping\n\n"
                    await asyncio.sleep(0)
            break
        except Exception as e:
            is_quota = "quota" in str(e).lower() or "limit" in str(e).lower() or "exhausted" in str(e).lower() or "429" in str(e)
            if is_quota and attempt < 3:
                yield sse_message({'event': 'status', 'agent': 'research', 'status': 'start', 'message': f'Research Agent: Rate limit hit. Waiting 12 seconds to retry (attempt {attempt+1}/4)...'})
                await asyncio.sleep(0)
                research_output = ""
                for _ in range(12):
                    await asyncio.sleep(1.0)
                    if asyncio.get_event_loop().time() - last_ping >= 15:
                        last_ping = asyncio.get_event_loop().time()
                        yield ": ping\n\n"
                        await asyncio.sleep(0)
            else:
                yield sse_message({'event': 'error', 'message': f'Error during Research: {str(e)}'})
                await asyncio.sleep(0)
                return

    yield sse_message({'event': 'status', 'agent': 'research', 'status': 'done', 'message': 'Research Agent: Completed research phase!'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Heartbeat check
    if asyncio.get_event_loop().time() - last_ping >= 15:
        last_ping = asyncio.get_event_loop().time()
        yield ": ping\n\n"
        await asyncio.sleep(0)

    # ==========================================
    # 2. WRITING AGENT
    # ==========================================
    yield sse_message({'event': 'status', 'agent': 'writer', 'status': 'start', 'message': 'Writing Agent: Creating the first draft based on research findings...'})
    await asyncio.sleep(0)
    await asyncio.sleep(0.5)

    draft_output = ""
    for attempt in range(4):
        try:
            writer_prompt = f"Here is the research brief:\n\n{research_output}\n\nWrite the first draft of the blog post now."
            system_instruction = WRITING_AGENT_INSTRUCTIONS.format(tone=tone, length=length, topic=topic, language=language)

            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=writer_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.7
                )
            )

            for chunk in response_stream:
                text = chunk.text or ""
                draft_output += text
                yield sse_message({'event': 'content', 'agent': 'writer', 'text': text})
                await asyncio.sleep(0)
                if asyncio.get_event_loop().time() - last_ping >= 15:
                    last_ping = asyncio.get_event_loop().time()
                    yield ": ping\n\n"
                    await asyncio.sleep(0)
            break
        except Exception as e:
            is_quota = "quota" in str(e).lower() or "limit" in str(e).lower() or "exhausted" in str(e).lower() or "429" in str(e)
            if is_quota and attempt < 3:
                yield sse_message({'event': 'status', 'agent': 'writer', 'status': 'start', 'message': f'Writing Agent: Rate limit hit. Waiting 12 seconds to retry (attempt {attempt+1}/4)...'})
                await asyncio.sleep(0)
                draft_output = ""
                for _ in range(12):
                    await asyncio.sleep(1.0)
                    if asyncio.get_event_loop().time() - last_ping >= 15:
                        last_ping = asyncio.get_event_loop().time()
                        yield ": ping\n\n"
                        await asyncio.sleep(0)
            else:
                yield sse_message({'event': 'error', 'message': f'Error during Writing: {str(e)}'})
                await asyncio.sleep(0)
                return

    yield sse_message({'event': 'status', 'agent': 'writer', 'status': 'done', 'message': 'Writing Agent: Completed first draft!'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Heartbeat check
    if asyncio.get_event_loop().time() - last_ping >= 15:
        last_ping = asyncio.get_event_loop().time()
        yield ": ping\n\n"
        await asyncio.sleep(0)

    # ==========================================
    # 3. EDITING AGENT
    # ==========================================
    yield sse_message({'event': 'status', 'agent': 'editor', 'status': 'start', 'message': 'Editing Agent: Polishing the draft for flow, tone, and grammar...'})
    await asyncio.sleep(0)
    await asyncio.sleep(0.5)

    final_output = ""
    for attempt in range(4):
        try:
            editor_prompt = f"Please edit and polish the following draft. Correct any structural errors, improve readability, and ensure headings flow logically:\n\n{draft_output}"

            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=editor_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=EDITING_AGENT_INSTRUCTIONS,
                    temperature=0.3
                )
            )

            for chunk in response_stream:
                text = chunk.text or ""
                final_output += text
                yield sse_message({'event': 'content', 'agent': 'editor', 'text': text})
                await asyncio.sleep(0)
                if asyncio.get_event_loop().time() - last_ping >= 15:
                    last_ping = asyncio.get_event_loop().time()
                    yield ": ping\n\n"
                    await asyncio.sleep(0)
            break
        except Exception as e:
            is_quota = "quota" in str(e).lower() or "limit" in str(e).lower() or "exhausted" in str(e).lower() or "429" in str(e)
            if is_quota and attempt < 3:
                yield sse_message({'event': 'status', 'agent': 'editor', 'status': 'start', 'message': f'Editing Agent: Rate limit hit. Waiting 12 seconds to retry (attempt {attempt+1}/4)...'})
                await asyncio.sleep(0)
                final_output = ""
                for _ in range(12):
                    await asyncio.sleep(1.0)
                    if asyncio.get_event_loop().time() - last_ping >= 15:
                        last_ping = asyncio.get_event_loop().time()
                        yield ": ping\n\n"
                        await asyncio.sleep(0)
            else:
                yield sse_message({'event': 'error', 'message': f'Error during Editing: {str(e)}'})
                await asyncio.sleep(0)
                return

    yield sse_message({'event': 'status', 'agent': 'editor', 'status': 'done', 'message': 'Editing Agent: Completed final edit!'})
    await asyncio.sleep(0)
    await asyncio.sleep(1.0)

    # Heartbeat check
    if asyncio.get_event_loop().time() - last_ping >= 15:
        last_ping = asyncio.get_event_loop().time()
        yield ": ping\n\n"
        await asyncio.sleep(0)

    # ==========================================
    # 4. SEO AGENT
    # ==========================================
    yield sse_message({'event': 'status', 'agent': 'seo', 'status': 'start', 'message': 'SEO Agent: Generating SEO report and optimization tips...'})
    await asyncio.sleep(0)
    await asyncio.sleep(0.5)

    for attempt in range(4):
        try:
            seo_prompt = f"Here is the final polished blog post:\n\n{final_output}\n\nPlease generate a comprehensive SEO optimization report for it."
            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=seo_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SEO_AGENT_INSTRUCTIONS,
                    temperature=0.3
                )
            )

            for chunk in response_stream:
                text = chunk.text or ""
                yield sse_message({'event': 'content', 'agent': 'seo', 'text': text})
                await asyncio.sleep(0)
                if asyncio.get_event_loop().time() - last_ping >= 15:
                    last_ping = asyncio.get_event_loop().time()
                    yield ": ping\n\n"
                    await asyncio.sleep(0)
            break
        except Exception as e:
            is_quota = "quota" in str(e).lower() or "limit" in str(e).lower() or "exhausted" in str(e).lower() or "429" in str(e)
            if is_quota and attempt < 3:
                yield sse_message({'event': 'status', 'agent': 'seo', 'status': 'start', 'message': f'SEO Agent: Rate limit hit. Waiting 12 seconds to retry (attempt {attempt+1}/4)...'})
                await asyncio.sleep(0)
                for _ in range(12):
                    await asyncio.sleep(1.0)
                    if asyncio.get_event_loop().time() - last_ping >= 15:
                        last_ping = asyncio.get_event_loop().time()
                        yield ": ping\n\n"
                        await asyncio.sleep(0)
            else:
                yield sse_message({'event': 'error', 'message': f'Error during SEO analysis: {str(e)}'})
                await asyncio.sleep(0)
                return

    yield sse_message({'event': 'status', 'agent': 'seo', 'status': 'done', 'message': 'SEO Agent: Completed SEO report!'})
    await asyncio.sleep(0)
    await asyncio.sleep(0.5)

    yield sse_message({'event': 'complete', 'message': 'All agents have completed their tasks. Blog post and SEO report are ready!'})
    await asyncio.sleep(0)


@app.get("/api/generate")
async def generate_blog_post(
    topic: str = Query(..., description="The topic of the blog post"),
    tone: str = Query("professional", description="The tone of the blog post"),
    length: str = Query("medium", description="The approximate length of the post"),
    language: str = Query("English", description="The language of the post"),
    x_api_key: str = Header(None),
    api_key: str = Query(None)
):
    headers = {
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    }

    # Validate API Key
    try:
        validated_api_key = get_api_key(x_api_key, api_key)
    except HTTPException as e:
        # Return a stream that immediately yields an error if credentials are missing
        async def error_generator():
            yield sse_message({'event': 'error', 'message': e.detail})
            await asyncio.sleep(0)
        return StreamingResponse(error_generator(), media_type="text/event-stream", headers=headers)

    async def event_generator():
        async for chunk in run_agent_pipeline(topic, tone, length, validated_api_key, language):
            yield chunk
            await asyncio.sleep(0)

    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers=headers
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
