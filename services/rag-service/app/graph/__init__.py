"""LangGraph StateGraph orchestrator for RAG pipeline."""
import structlog
from langgraph.graph import StateGraph, END
from app.graph.state import GraphState
from app.graph.nodes import retrieve, grade_documents, rewrite_query, generate, should_rewrite

logger = structlog.get_logger(__name__)


def build_rag_graph() -> StateGraph:
    """Build and compile the RAG LangGraph pipeline."""
    graph = StateGraph(GraphState)

    graph.add_node("retrieve", retrieve)
    graph.add_node("grade_documents", grade_documents)
    graph.add_node("rewrite_query", rewrite_query)
    graph.add_node("generate", generate)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "grade_documents")
    graph.add_conditional_edges(
        "grade_documents",
        should_rewrite,
        {"rewrite": "rewrite_query", "generate": "generate"},
    )
    graph.add_edge("rewrite_query", "retrieve")
    graph.add_edge("generate", END)

    return graph.compile()


# Module-level compiled graph (created once at import)
rag_graph = build_rag_graph()
