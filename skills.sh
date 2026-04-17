#!/bin/bash
# ZORA AI Skills Bootstrapper
# Sets up the 3 core open-source ML models for the project locally.
# It creates virtualenvs to avoid polluting the global python scope.

set -e

echo "============================================="
echo " ZORA: Bootstrapping SOTA AI Skills          "
echo "============================================="

# 1. Local LLMs via Ollama
echo ""
echo "---> [1/3] Setting up Local Reasoning (Ollama)"
if ! command -v ollama &> /dev/null; then
    echo "WARNING: Ollama is not installed. Please install it from https://ollama.ai"
else
    echo "Pulling Llama 3.1 8B (Reasoning)..."
    ollama pull llama3.1:8b || echo "Failed to pull llama3.1:8b"
    echo "Pulling LLaVA 1.5 13B (Vision)..."
    ollama pull llava:13b || echo "Failed to pull llava:13b"
fi

# 2. Virtual Try-On (IDM-VTON)
echo ""
echo "---> [2/3] Setting up Virtual Try-On (IDM-VTON)"
if [ ! -d "ai/third_party/IDM-VTON" ]; then
    echo "Cloning IDM-VTON repo..."
    mkdir -p ai/third_party
    git clone https://github.com/yisol/IDM-VTON.git ai/third_party/IDM-VTON
    
    echo "Creating virtualenv for IDM-VTON..."
    python3 -m venv ai/third_party/IDM-VTON/.venv
    # Note: the user must manually install requirements based on their GPU constraints
    echo "Run 'source ai/third_party/IDM-VTON/.venv/bin/activate && pip install -r requirements.txt' when ready."
else
    echo "IDM-VTON already exists in ai/third_party/IDM-VTON."
fi

# 3. 3D Body Mesh (SMPLest-X)
echo ""
echo "---> [3/3] Setting up Body Mesh Extraction (SMPLest-X)"
if [ ! -d "ai/third_party/SMPLest-X" ]; then
    echo "Cloning SMPLest-X repo..."
    mkdir -p ai/third_party
    git clone https://github.com/SMPLest/SMPLest-X.git ai/third_party/SMPLest-X
    
    echo "Creating virtualenv for SMPLest-X..."
    python3 -m venv ai/third_party/SMPLest-X/.venv
    echo "Run 'source ai/third_party/SMPLest-X/.venv/bin/activate && pip install -r requirements.txt' when ready."
else
    echo "SMPLest-X already exists in ai/third_party/SMPLest-X."
fi

echo ""
echo "============================================="
echo " Bootstrap Complete! "
echo " Ensure you check the project's .claude/CLAUDE.md for environment variables"
echo " configuration before starting the FastAPI inference server."
echo "============================================="
