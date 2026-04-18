---
name: superpowers
description: Trigger when designing architecture, setting up testing, debugging, handling fallback scenarios, or working on modular design for the ZORA system
---

# Global AI & Coding Superpowers Skill

## Goal
Establish coding practices that ensure the system remains resilient, scalable, and adaptable as open-source AI models evolve. 

## 1. Modular Model Adapters (Plug-and-Play)

> [!IMPORTANT]
> Never hardcode deep dependencies on a specific AI repository (e.g. `import IDM_VTON_runner`). Create adapter interfaces that allow switching backend implementations via environment variables.

### Pattern: The Adapter
```python
# ai/app/services/vton_service.py
import os
from abc import ABC, abstractmethod

class BaseVTONService(ABC):
    @abstractmethod
    def generate_image(self, person_photo: str, garment_photo: str) -> str:
        pass

class IDMVTONAdapter(BaseVTONService):
    def generate_image(self, person_photo: str, garment_photo: str) -> str:
        # IDM-VTON specific subprocess/inference
        pass

class CatVTONAdapter(BaseVTONService):
    def generate_image(self, person_photo: str, garment_photo: str) -> str:
        # CatVTON specific logic
        pass

def get_vton_service() -> BaseVTONService:
    model_type = os.getenv("VTON_MODEL", "idmvton")
    if model_type == "catvton":
        return CatVTONAdapter()
    return IDMVTONAdapter()
```

## 2. Graceful Degradation & Fallbacks

AI APIs fail. Models go OOM. Always implement a static or simpler fallback.

- If **SMPLest-X** (expressive 3D) runs out of VRAM -> catch `RuntimeError` -> try **HMR2.0** (simpler, less VRAM).
- If **LLaVA** times out paring a size chart -> return rule-based generic sizes based on scraped HTML DOM.
- If **IDM-VTON** cannot generate within 30 seconds -> fallback to CPU-inference queue or notify user.

## 3. Test-Driven Development (TDD) for Pipelines

Write input/output structural tests before adding new ML code.

1. **Write Schema**: Define strict `Pydantic` schemas for your output.
2. **Fixture Mocks**: Instead of running a 5-minute model just to test your backend router, mock the `AI_SERVICE_URL` or use hardcoded fixtures like `tests/fixtures/mock_mesh.glb`.
3. **Assert Contracts**: Ensure the frontend/backend contract never breaks, even if the AI model pipeline fails.

## 4. Prompt Engineering as Code

> [!TIP]
> Treat prompts exactly like code. Version them, comment them, and parameterize them dynamically.

- **Bad**: `prompt = f"Hi, the size is {size}. Write about it."`
- **Good**: 
    ```python
    SYSTEM_PROMPT = """You are ZORA, an expert fashion fit assistant.
    Constraint 1: Never output JSON.
    Constraint 2: Keep explanation under 3 sentences.
    """
    
    def format_fit_prompt(garment: str, breakdown: dict) -> str:
        # Template loading logic
        return ...
    ```

## 5. Defensive Exception Handling

Wrap every external/AI call in structured try-catches that give actionable telemetry.
```python
try:
    mesh = run_smplestx(front, side)
except torch.cuda.OutOfMemoryError:
    logger.warning("CUDA OOM in SMPLest-X. Consider falling back to HMR2.0")
    raise HTTPException(status_code=503, detail="GPU memory exceeded")
except Exception as e:
    logger.error(f"Failed to generate mesh: {e}")
    raise HTTPException(status_code=500, detail="Internal mesh generation error")
```
