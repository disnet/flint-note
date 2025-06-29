# flint-note Prompts Directory

This directory contains all prompt files for flint-note AI integrations, organized by purpose and complexity level.

## 📁 File Organization

### Core System Prompts
- **`system_core.md`** - Main system prompt for standard AI models

### Simple/Weak Model Support
- **`simple_models_basic.md`** - Ultra-simple 7-step workflow for very weak models (includes agent instruction checking)
- **`simple_models_detailed.md`** - Step-by-step instructions for moderately weak models
- **`training_examples.md`** - Comprehensive test scenarios and validation examples

## 🎯 Quick Start Guide

### For Standard AI Models
1. Start with **`system_core.md`** - core behaviors and principles
2. Reference **`instructions_comprehensive.md`** for advanced scenarios

### For Weak/Simple AI Models
1. **Very Basic Models**: Use **`simple_models_basic.md`** (7-step workflow with agent instructions and basic search)
2. **Moderately Weak Models**: Use **`simple_models_detailed.md`** (detailed procedures with agent instructions and advanced search)
3. **Training/Validation**: Use **`training_examples.md`** for testing

## 📊 Model Complexity Guide

| Model Capability | Recommended Prompts | Key Features |
|-----------------|-------------------|--------------|
| **GPT-4, Claude 3.5+** | `system_core.md` | Natural conversation, advanced search mastery, agent instruction checking, batch operations, content hash safety |
| **GPT-3.5, Claude 3** | `system_core.md` + `instructions_comprehensive.md` | Explicit guidance, advanced search tools, mandatory agent instruction checking, batch operations, content hash handling |
| **Smaller Models** | `simple_models_detailed.md` | Step-by-step procedures, search guidance, agent instruction workflows, basic batch support, content hash requirements |
| **Very Basic Models** | `simple_models_basic.md` | Template responses, basic search tools, mandatory agent instruction checking, single operations only, basic content hash safety |

## 🔄 Integration Workflow

### 1. Choose Your Starting Point
```
Standard Model → system_core.md
Weak Model → simple_models_basic.md or simple_models_detailed.md
```

### 2. Test and Validate
```
Use training_examples.md scenarios
Verify core behaviors work correctly
Test error handling and edge cases
```

## 🎨 Customization Guidelines

### Adding Domain-Specific Behavior
1. Start with appropriate base prompt
2. Add domain-specific note types and agent instructions
3. Include relevant metadata schemas
4. Configure search strategies for domain-specific discovery
5. Test with domain-specific scenarios

## 🧪 Testing and Validation

### Required Test Scenarios
Every implementation should pass scenarios from `training_examples.md`:
- ✅ Cold start (no note types exist)
- ✅ Warm system (note types exist)
- ✅ **Agent instruction checking before every note creation**
- ✅ User permission for new note types
- ✅ Agent instruction following
- ✅ Error handling and recovery
- ✅ **Hybrid search tool usage (search_notes, search_notes_advanced, search_notes_sql)**
- ✅ Search result interpretation and connection suggestions
- ✅ Batch operations (create/update multiple notes)
- ✅ Partial failure handling in batch operations
- ✅ **Content hash safety in update operations**
- ✅ Content hash conflict detection and resolution

### Success Criteria
- Models follow mandatory workflow steps
- **Models ALWAYS check agent instructions before creating notes**
- Users give permission before new note types created
- Agent instructions are followed consistently
- **Models use appropriate hybrid search tools for discovery and connections**
- Search results are interpreted correctly and connections suggested
- Information extraction works accurately
- Conversations feel natural and helpful
- Batch operations are used efficiently for multiple notes
- Partial failures in batch operations are handled gracefully
- **Content hashes are included in all update operations for safety**
- Content hash conflicts are detected and resolved appropriately
