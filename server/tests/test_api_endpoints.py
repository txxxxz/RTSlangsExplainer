import asyncio
import json
import httpx
import pytest
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_profile_endpoints():
    """测试 profile 相关的 API 端点"""
    # 测试数据
    test_profile = {
        "id": "test-profile-1",
        "name": "Test Profile",
        "description": "This is a test profile",
        "primaryLanguage": "en",
        "cultures": ["US", "UK"],
        "demographics": {
            "ageRange": "18-25",
            "gender": "Female",
            "region": "United States",
            "occupation": "Student"
        },
        "personalPreference": "Prefer casual explanations",
        "tone": "Friendly and casual explanations.",
        "goals": "Learn cultural context",
        "createdAt": int(datetime.now().timestamp() * 1000),
        "updatedAt": int(datetime.now().timestamp() * 1000)
    }

    # 1. 首先测试 GET 请求，检查初始状态
    print("\n1. 测试 GET /profiles")
    response = httpx.get(f"{BASE_URL}/profiles")
    assert response.status_code == 200
    initial_profiles = response.json()["profiles"]
    print(f"初始 profiles 数量: {len(initial_profiles)}")

    # 2. 测试 PUT 请求，添加新的 profile
    print("\n2. 测试 PUT /profiles")
    response = httpx.put(
        f"{BASE_URL}/profiles",
        json=test_profile
    )
    assert response.status_code == 200
    saved_profile = response.json()
    print(f"保存的 profile: {json.dumps(saved_profile, indent=2, ensure_ascii=False)}")

    # 3. 再次测试 GET 请求，确认数据已保存
    print("\n3. 再次测试 GET /profiles")
    response = httpx.get(f"{BASE_URL}/profiles")
    assert response.status_code == 200
    updated_profiles = response.json()["profiles"]
    print(f"更新后 profiles 数量: {len(updated_profiles)}")
    assert len(updated_profiles) > len(initial_profiles)

    # 4. 测试 DELETE 请求
    print("\n4. 测试 DELETE /profiles/{id}")
    response = httpx.delete(f"{BASE_URL}/profiles/{test_profile['id']}")
    assert response.status_code == 200
    print("删除成功")

    # 5. 最后再次 GET 请求，确认数据已删除
    print("\n5. 最后测试 GET /profiles")
    response = httpx.get(f"{BASE_URL}/profiles")
    assert response.status_code == 200
    final_profiles = response.json()["profiles"]
    print(f"最终 profiles 数量: {len(final_profiles)}")
    assert len(final_profiles) == len(initial_profiles)

if __name__ == "__main__":
    print("开始测试 Profile API 端点...")
    try:
        test_profile_endpoints()
        print("\n✅ 所有测试通过!")
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")